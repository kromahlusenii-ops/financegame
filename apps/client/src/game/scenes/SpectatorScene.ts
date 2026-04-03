import Phaser from 'phaser';

export default class SpectatorScene extends Phaser.Scene {
  private ghosts = new Map<string, Phaser.GameObjects.Rectangle>();
  private ground!: Phaser.GameObjects.TileSprite;
  private leaderboardTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: 'SpectatorScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Ground
    this.ground = this.add.tileSprite(0, height - 32, width * 2, 32, 'ground')
      .setOrigin(0, 0);

    // "You finished" banner
    this.add.rectangle(width / 2, 30, width, 50, 0x000000, 0.7);
    this.add.text(width / 2, 30, 'You have been eliminated - Spectating', {
      fontSize: '16px',
      color: '#ff6666',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Leaderboard sidebar
    this.add.rectangle(width - 100, height / 2, 180, height, 0x000000, 0.5);
    this.add.text(width - 100, 70, 'Leaderboard', {
      fontSize: '14px',
      color: '#ffaa00',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Listen for updates
    const onMessage = this.registry.get('onMessage');
    if (onMessage) {
      onMessage((msg: {
        type: string;
        positions?: { playerId: string; positionX: number }[];
        leaderboard?: Array<{ rank: number; displayName: string; score: number }>;
        finalLeaderboard?: unknown[];
      }) => {
        switch (msg.type) {
          case 'player_positions':
            this.updateGhosts(msg.positions || []);
            break;
          case 'checkpoint_results':
            if (msg.leaderboard) {
              this.updateLeaderboard(msg.leaderboard);
            }
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
    this.ground.tilePositionX += (150 * delta) / 1000;
  }

  private updateGhosts(positions: { playerId: string; positionX: number }[]): void {
    const { height } = this.scale;
    for (const pos of positions) {
      if (!this.ghosts.has(pos.playerId)) {
        const sprite = this.add.rectangle(pos.positionX, height - 68, 28, 36, 0x888888)
          .setAlpha(0.6);
        this.ghosts.set(pos.playerId, sprite);
      } else {
        const sprite = this.ghosts.get(pos.playerId)!;
        sprite.x += (pos.positionX - sprite.x) * 0.1;
      }
    }
  }

  private updateLeaderboard(entries: Array<{ rank: number; displayName: string; score: number }>): void {
    const { width } = this.scale;

    // Clear old texts
    for (const t of this.leaderboardTexts) t.destroy();
    this.leaderboardTexts = [];

    entries.slice(0, 10).forEach((entry, i) => {
      const text = this.add.text(width - 180, 95 + i * 22, `#${entry.rank} ${entry.displayName} - ${entry.score}`, {
        fontSize: '11px',
        color: '#cccccc',
      });
      this.leaderboardTexts.push(text);
    });
  }
}
