import Phaser from 'phaser';

const TILE_SIZE = 70;
const GHOST_SKINS = ['p1', 'p2', 'p3'];

export default class SpectatorScene extends Phaser.Scene {
  private ghosts = new Map<string, Phaser.GameObjects.Sprite>();
  private grassLayer!: Phaser.GameObjects.TileSprite;
  private bgImage!: Phaser.GameObjects.TileSprite;
  private leaderboardTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: 'SpectatorScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const groundY = height - TILE_SIZE;

    // Background
    this.bgImage = this.add.tileSprite(0, 0, width, height, 'bgGrasslands')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(0);

    // Ground
    this.grassLayer = this.add.tileSprite(0, groundY, width, TILE_SIZE, 'grassMid')
      .setOrigin(0, 0).setDepth(5);
    this.add.tileSprite(0, groundY + TILE_SIZE, width, TILE_SIZE, 'dirtCenter')
      .setOrigin(0, 0).setDepth(5);

    // Eliminated banner
    this.add.rectangle(width / 2, 30, width, 50, 0x000000, 0.7).setDepth(40);
    this.add.text(width / 2, 30, 'Eliminated - Spectating', {
      fontSize: '16px',
      color: '#ff6666',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(41);

    // Leaderboard sidebar
    this.add.rectangle(width - 90, height / 2, 170, height, 0x000000, 0.5).setDepth(40);
    this.add.text(width - 90, 65, 'Leaderboard', {
      fontSize: '13px',
      color: '#ffaa00',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(41);

    const onMessage = this.registry.get('onMessage');
    if (onMessage) {
      onMessage((msg: any) => {
        switch (msg.type) {
          case 'player_positions':
            this.updateGhosts(msg.positions || []);
            break;
          case 'checkpoint_results':
            if (msg.leaderboard) this.updateLeaderboard(msg.leaderboard);
            break;
          case 'session_ended':
            this.registry.set('finalLeaderboard', msg.finalLeaderboard);
            this.scene.start('LeaderboardScene');
            break;
        }
      });
    }
  }

  update(_time: number, delta: number): void {
    const speed = 150;
    this.bgImage.tilePositionX += (speed * 0.1 * delta) / 1000;
    this.grassLayer.tilePositionX += (speed * delta) / 1000;
  }

  private updateGhosts(positions: { playerId: string; positionX: number }[]): void {
    const { height } = this.scale;
    const groundY = height - TILE_SIZE;

    for (const pos of positions) {
      if (!this.ghosts.has(pos.playerId)) {
        const skinIdx = this.ghosts.size % GHOST_SKINS.length;
        const skin = GHOST_SKINS[skinIdx];
        const sprite = this.add.sprite(pos.positionX, groundY - 48, `${skin}_stand`)
          .setAlpha(0.5).setDepth(7);
        sprite.play(`${skin}_run`);
        this.ghosts.set(pos.playerId, sprite);
      } else {
        const sprite = this.ghosts.get(pos.playerId)!;
        sprite.x += (pos.positionX - sprite.x) * 0.1;
      }
    }
  }

  private updateLeaderboard(entries: Array<{ rank: number; displayName: string; score: number }>): void {
    const { width } = this.scale;
    for (const t of this.leaderboardTexts) t.destroy();
    this.leaderboardTexts = [];

    entries.slice(0, 8).forEach((entry, i) => {
      const text = this.add.text(width - 165, 85 + i * 22,
        `#${entry.rank} ${entry.displayName.slice(0, 10)} ${entry.score}`, {
        fontSize: '10px',
        color: '#cccccc',
      }).setDepth(41);
      this.leaderboardTexts.push(text);
    });
  }
}
