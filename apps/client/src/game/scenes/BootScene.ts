import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    // Create simple colored rectangle textures
    this.createTexture('player', 28, 36, 0x00ff88);
    this.createTexture('ghost', 28, 36, 0x888888);
    this.createTexture('ground', 64, 32, 0x4a4a6a);
    this.createTexture('barrier', 32, 60, 0xff4444);
    this.createTexture('sky1', 2, 2, 0x0f0f2e);
    this.createTexture('sky2', 2, 2, 0x1a1a3e);
    this.createTexture('sky3', 2, 2, 0x252550);

    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2, 'Loading...', {
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Check session state — skip to the right scene
    const sessionState = this.registry.get('sessionState');
    if (sessionState) {
      this.routeToScene(sessionState);
      return;
    }

    // If no state yet, listen for it to arrive from polling
    this.registry.events.on('changedata-sessionState', (_parent: unknown, value: any) => {
      if (value && this.scene.isActive('BootScene')) {
        this.routeToScene(value);
      }
    });

    // Fallback: go to LobbyScene after 3s if nothing happens
    this.time.delayedCall(3000, () => {
      if (this.scene.isActive('BootScene')) {
        this.scene.start('LobbyScene');
      }
    });
  }

  private routeToScene(sessionState: any): void {
    const status = sessionState?.session?.status;
    if (status === 'running' || status === 'checkpoint_active') {
      this.scene.start('RunnerScene');
    } else if (status === 'ended') {
      this.registry.set('finalLeaderboard', sessionState.finalLeaderboard);
      this.scene.start('LeaderboardScene');
    } else {
      this.scene.start('LobbyScene');
    }
  }

  private createTexture(key: string, w: number, h: number, color: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 1);
    graphics.fillRect(0, 0, w, h);
    graphics.generateTexture(key, w, h);
    graphics.destroy();
  }
}
