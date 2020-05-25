import './styleV2.scss';
import 'bootstrap';

import {
    
  AudioVideoFacade,
  MeetingSession,
  VideoTileState,
  DefaultModality,
  MeetingSessionVideoAvailability,
  AudioVideoObserver,
  
} from '../../../../src/index';

function updateProperty(obj: any, key: string, value: string) {
  if (value !== undefined && obj[key] !== value) {
    obj[key] = value;
  }
}

export class DemoTileOrganizer implements AudioVideoObserver {
    static MAX_TILES = 17;
    private tiles: { [id: number]: number } = {};
    public tileStates: {[id: number]: boolean } = {};
    audioVideo: AudioVideoFacade | null = null;
    meetingSession: MeetingSession | null = null;
    roster: any = {};
    tileIndexToTileId: { [id: number]: number } = {};
    tileIdToTileIndex: { [id: number]: number } = {};
    activeSpeakerLayout = true;
    canStartLocalVideo: boolean = true;
    acquireTileIndex(tileId: number): number {
      for (let index = 0; index < DemoTileOrganizer.MAX_TILES; index++) {
        if (this.tiles[index] === tileId) {
          return index;
        }
      }
      for (let index = 0; index < DemoTileOrganizer.MAX_TILES; index++) {
        if (!(index in this.tiles)) {
          this.tiles[index] = tileId;
          return index;
        }
      }
      throw new Error('no tiles are available');
    }
  
    releaseTileIndex(tileId: number): number {
      for (let index = 0; index < DemoTileOrganizer.MAX_TILES; index++) {
        if (this.tiles[index] === tileId) {
          delete this.tiles[index];
          return index;
        }
      }
      return DemoTileOrganizer.MAX_TILES;
    }

    videoTileDidUpdate(tileState: VideoTileState): void {
      // this.log(`video tile updated: ${JSON.stringify(tileState, null, '  ')}`);
      if (!tileState.boundAttendeeId) {
        return;
      }
      const selfAttendeeId = this.meetingSession.configuration.credentials.attendeeId;
      const modality = new DefaultModality(tileState.boundAttendeeId);
      if (modality.base() === selfAttendeeId && modality.hasModality(DefaultModality.MODALITY_CONTENT)) {
        // don't bind one's own content
        return;
      }
      const tileIndex = tileState.localTile
        ? 16
        : this.acquireTileIndex(tileState.tileId);
      const tileElement = document.getElementById(`tile-${tileIndex}`) as HTMLDivElement;
      const videoElement = document.getElementById(`video-${tileIndex}`) as HTMLVideoElement;
      const nameplateElement = document.getElementById(`nameplate-${tileIndex}`) as HTMLDivElement;
      const pauseButtonElement = document.getElementById(`video-pause-${tileIndex}`) as HTMLButtonElement;
  
      pauseButtonElement.addEventListener('click', () => {
        if (!tileState.paused) {
          this.audioVideo.pauseVideoTile(tileState.tileId);
          pauseButtonElement.innerText = 'Resume';
        } else {
          this.audioVideo.unpauseVideoTile(tileState.tileId);
          pauseButtonElement.innerText = 'Pause';
        }
      });
  
      // this.log(`binding video tile ${tileState.tileId} to ${videoElement.id}`);
      this.audioVideo.bindVideoElement(tileState.tileId, videoElement);
      this.tileIndexToTileId[tileIndex] = tileState.tileId;
      this.tileIdToTileIndex[tileState.tileId] = tileIndex;
      updateProperty(nameplateElement, 'innerText', tileState.boundExternalUserId.split('#')[1]);
      tileElement.style.display = 'block';
      this.layoutVideoTiles();
    }
  
    videoTileWasRemoved(tileId: number): void {
      // this.log(`video tile removed: ${tileId}`);
      this.hideTile(this.releaseTileIndex(tileId));
    }
  
    videoAvailabilityDidChange(availability: MeetingSessionVideoAvailability): void {
      this.canStartLocalVideo = availability.canStartLocalVideo;
      // this.log(`video availability changed: canStartLocalVideo  ${availability.canStartLocalVideo}`);
    }


    hideTile(tileIndex: number): void {
      const tileElement = document.getElementById(`tile-${tileIndex}`) as HTMLDivElement;
      tileElement.style.display = 'none';
      this.layoutVideoTiles();
    }
  
    tileIdForAttendeeId(attendeeId: string): number | null {
      for (const tile of this.audioVideo.getAllVideoTiles()) {
        const state = tile.state();
        if (state.boundAttendeeId === attendeeId) {
          return state.tileId;
        }
      }
      return null;
    }
  
    findContentTileId(): number | null {
      for (const tile of this.audioVideo.getAllVideoTiles()) {
        const state = tile.state();
        if (state.isContent) {
          return state.tileId;
        }
      }
      return null;
    }
  
    isContentTile(tileIndex: number): boolean {
      const tileId = this.tileIndexToTileId[tileIndex];
      if (!tileId) {
        return false;
      }
      const tile = this.audioVideo.getVideoTile(tileId);
      const state = tile.state();
      if (state.isContent) {
        return true;
      }
      return false;
    }
  
    activeTileId(): number | null {
      let contentTileId = this.findContentTileId();
      if (contentTileId !== null) {
        return contentTileId;
      }
      for (const attendeeId in this.roster) {
        if (this.roster[attendeeId].active) {
          return this.tileIdForAttendeeId(attendeeId);
        }
      }
      return null;
    }
  
    layoutVideoTiles(): void {
      if (!this.meetingSession) {
        return;
      }
      const selfAttendeeId = this.meetingSession.configuration.credentials.attendeeId;
      const selfTileId = this.tileIdForAttendeeId(selfAttendeeId);
      const visibleTileIndices = this.visibleTileIndices();
      let activeTileId = this.activeTileId();
      const selfIsVisible = visibleTileIndices.includes(this.tileIdToTileIndex[selfTileId]);
      if (visibleTileIndices.length === 2 && selfIsVisible) {
        activeTileId = this.tileIndexToTileId[
          visibleTileIndices[0] === selfTileId ? visibleTileIndices[1] : visibleTileIndices[0]
          ];
      }
      const hasVisibleActiveTile = visibleTileIndices.includes(
        this.tileIdToTileIndex[activeTileId]
      );
  
      if (this.activeSpeakerLayout && hasVisibleActiveTile) {
        this.layoutVideoTilesActiveSpeaker(visibleTileIndices, activeTileId);
      } else {
        this.layoutVideoTilesGrid(visibleTileIndices);
      }
    }
  
    visibleTileIndices(): number[] {
      let tiles: number[] = [];
      const localTileIndex = DemoTileOrganizer.MAX_TILES;
      for (let tileIndex = 0; tileIndex <= localTileIndex; tileIndex++) {
        const tileElement = document.getElementById(`tile-${tileIndex}`) as HTMLDivElement;
        if (tileElement.style.display === 'block') {
          tiles.push(tileIndex);
        }
      }
      return tiles;
    }
  
    layoutVideoTilesActiveSpeaker(visibleTileIndices: number[], activeTileId: number): void {
      const tileArea = document.getElementById('tile-area') as HTMLDivElement;
      const width = tileArea.clientWidth;
      const height = tileArea.clientHeight;
      const widthToHeightAspectRatio = 16 / 9;
      const maximumRelativeHeightOfOthers = 0.3;
  
      const activeWidth = width;
      const activeHeight = width / widthToHeightAspectRatio;
      const othersCount = visibleTileIndices.length - 1;
      let othersWidth = width / othersCount;
      let othersHeight = width / widthToHeightAspectRatio;
      if (othersHeight / activeHeight > maximumRelativeHeightOfOthers) {
        othersHeight = activeHeight * maximumRelativeHeightOfOthers;
        othersWidth = othersHeight * widthToHeightAspectRatio;
      }
      if (othersCount === 0) {
        othersHeight = 0;
      }
      const totalHeight = activeHeight + othersHeight;
      const othersTotalWidth = othersWidth * othersCount;
      const othersXOffset = width / 2 - othersTotalWidth / 2;
      const activeYOffset = height / 2 - totalHeight / 2;
      const othersYOffset = activeYOffset + activeHeight;
  
      let othersIndex = 0;
      for (let i = 0; i < visibleTileIndices.length; i++) {
        const tileIndex = visibleTileIndices[i];
        const tileId = this.tileIndexToTileId[tileIndex];
        let x = 0,
          y = 0,
          w = 0,
          h = 0;
        if (tileId === activeTileId) {
          x = 0;
          y = activeYOffset;
          w = activeWidth;
          h = activeHeight;
        } else {
          x = othersXOffset + othersIndex * othersWidth;
          y = othersYOffset;
          w = othersWidth;
          h = othersHeight;
          othersIndex += 1;
        }
        this.updateTilePlacement(tileIndex, x, y, w, h);
      }
    }
  
    updateTilePlacement(tileIndex: number, x: number, y: number, w: number, h: number): void {
      const tile = document.getElementById(`tile-${tileIndex}`) as HTMLDivElement;
      if (this.isContentTile(tileIndex)) {
        tile.classList.remove('video-tile');
        tile.classList.add('content-share-tile');
      } else {
        tile.classList.remove('content-share-tile');
        tile.classList.add('video-tile');
      }
      const insetWidthSize = 4;
      const insetHeightSize = insetWidthSize / (16 / 9);
      tile.style.position = 'absolute';
      tile.style.left = `${x + insetWidthSize}px`;
      tile.style.top = `${y + insetHeightSize}px`;
      tile.style.width = `${w - insetWidthSize * 2}px`;
      tile.style.height = `${h - insetHeightSize * 2}px`;
      tile.style.margin = '0';
      tile.style.padding = '0';
      tile.style.visibility = 'visible';
      const video = document.getElementById(`video-${tileIndex}`) as HTMLDivElement;
      if (video) {
        video.style.position = 'absolute';
        video.style.left = '0';
        video.style.top = '0';
        video.style.width = `${w}px`;
        video.style.height = `${h}px`;
        video.style.margin = '0';
        video.style.padding = '0';
        video.style.borderRadius = '8px';
      }
      const nameplate = document.getElementById(`nameplate-${tileIndex}`) as HTMLDivElement;
      const nameplateSize = 24;
      const nameplatePadding = 10;
      nameplate.style.position = 'absolute';
      nameplate.style.left = '0px';
      nameplate.style.top = `${h - nameplateSize - nameplatePadding}px`;
      nameplate.style.height = `${nameplateSize}px`;
      nameplate.style.width = `${w}px`;
      nameplate.style.margin = '0';
      nameplate.style.padding = '0';
      nameplate.style.paddingLeft = `${nameplatePadding}px`;
      nameplate.style.color = '#fff';
      nameplate.style.backgroundColor = 'rgba(0,0,0,0)';
      nameplate.style.textShadow = '0px 0px 5px black';
      nameplate.style.letterSpacing = '0.1em';
      nameplate.style.fontSize = `${nameplateSize - 6}px`;
  
      let button = document.getElementById(`video-pause-${tileIndex}`) as HTMLButtonElement;
  
      button.style.position = 'absolute';
      button.style.display = 'inline-block';
      button.style.right = '0px';
      button.style.top = `${h - nameplateSize - nameplatePadding}px`;
      button.style.height = `${nameplateSize}px`;
      button.style.margin = '0';
      button.style.padding = '0';
      button.style.border = 'none';
      button.style.paddingRight = `${nameplatePadding}px`;
      button.style.color = '#fff';
      button.style.backgroundColor = 'rgba(0,0,0,0)';
      button.style.textShadow = '0px 0px 5px black';
      button.style.letterSpacing = '0.1em';
      button.style.fontSize = `${nameplateSize - 6}px`;
    }
  
    layoutVideoTilesGrid(visibleTileIndices: number[]): void {
      const tileArea = document.getElementById('tile-area') as HTMLDivElement;
      const width = tileArea.clientWidth;
      const height = tileArea.clientHeight;
      const widthToHeightAspectRatio = 16 / 9;
      let columns = 1;
      let totalHeight = 0;
      let rowHeight = 0;
      for (; columns < 18; columns++) {
        const rows = Math.ceil(visibleTileIndices.length / columns);
        rowHeight = width / columns / widthToHeightAspectRatio;
        totalHeight = rowHeight * rows;
        if (totalHeight <= height) {
          break;
        }
      }
      for (let i = 0; i < visibleTileIndices.length; i++) {
        const w = Math.floor(width / columns);
        const h = Math.floor(rowHeight);
        const x = (i % columns) * w;
        const y = Math.floor(i / columns) * h; // + (height / 2 - totalHeight / 2);
        this.updateTilePlacement(visibleTileIndices[i], x, y, w, h);
      }
    }
  


  }