import Phaser from 'phaser';

export default class LobbyScene extends Phaser.Scene {
  private playerSprites: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private waitingText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.text(width / 2, 60, 'Waiting for game to start', {
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.waitingText = this.add.text(width / 2, 100, '...', {
      fontSize: '16px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // Animate waiting dots
    let dots = 0;
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        dots = (dots + 1) % 4;
        this.waitingText.setText('.'.repeat(dots));
      },
    });

    // Listen for game launched
    const onMessage = this.registry.get('onMessage');
    if (onMessage) {
      onMessage((msg: { type: string; totalCheckpoints?: number; playerId?: string; displayName?: string }) => {
        if (msg.type === 'game_launched') {
          this.registry.set('totalCheckpoints', msg.totalCheckpoints);
          this.scene.start('RunnerScene');
        }
        if (msg.type === 'player_joined' && msg.playerId && msg.displayName) {
          this.addPlayerAvatar(msg.playerId, msg.displayName);
        }
      });
    }
  }

  private addPlayerAvatar(playerId: string, name: string): void {
    if (this.playerSprites.has(playerId)) return;

    const x = 50 + (this.playerSprites.size % 10) * 40;
    const y = 160 + Math.floor(this.playerSprites.size / 10) * 50;

    const rect = this.add.rectangle(x, y, 28, 36, 0x00ff88);
    this.playerSprites.set(playerId, rect);

    this.add.text(x, y + 28, name, {
      fontSize: '10px',
      color: '#cccccc',
    }).setOrigin(0.5, 0);

    // Bounce-in animation
    rect.setScale(0);
    this.tweens.add({
      targets: rect,
      scaleX: 1,
      scaleY: 1,
      duration: 300,
      ease: 'Back.easeOut',
    });
  }
}
