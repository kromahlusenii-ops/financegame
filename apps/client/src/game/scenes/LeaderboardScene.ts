import Phaser from 'phaser';
import type { LeaderboardEntry } from '@financegame/shared';

export default class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LeaderboardScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const leaderboard = (this.registry.get('finalLeaderboard') || []) as LeaderboardEntry[];
    const myPlayerId = this.registry.get('playerId') as string;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Title
    this.add.text(width / 2, 30, 'Final Results', {
      fontSize: '24px',
      color: '#ffaa00',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Podium — compact for mobile
    const podiumY = 80;
    const podiumW = 60;

    if (leaderboard.length >= 2) {
      // Silver - left
      this.createPodiumEntry(width / 2 - 80, podiumY, leaderboard[1], '#c0c0c0', 50, podiumW);
    }
    if (leaderboard.length >= 1) {
      // Gold - center
      this.createPodiumEntry(width / 2, podiumY - 20, leaderboard[0], '#ffd700', 70, podiumW);
    }
    if (leaderboard.length >= 3) {
      // Bronze - right
      this.createPodiumEntry(width / 2 + 80, podiumY + 5, leaderboard[2], '#cd7f32', 40, podiumW);
    }

    // Full leaderboard list below podium
    const startY = podiumY + 110;
    const rowHeight = 32;

    leaderboard.forEach((entry, i) => {
      const y = startY + i * rowHeight;
      if (y > height - 70) return; // Don't render below play again button

      const isMe = entry.displayName === myPlayerId;

      this.add.rectangle(width / 2, y, width - 20, 28, isMe ? 0x2ecc71 : 0x2a2a4a, 0.8);

      this.add.text(15, y, `#${entry.rank}`, {
        fontSize: '12px',
        color: '#888888',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5);

      this.add.text(45, y, entry.displayName, {
        fontSize: '12px',
        color: isMe ? '#ffffff' : '#cccccc',
        fontStyle: isMe ? 'bold' : 'normal',
      }).setOrigin(0, 0.5);

      this.add.text(width - 15, y, `${entry.score} pts`, {
        fontSize: '12px',
        color: '#ffaa00',
        fontStyle: 'bold',
      }).setOrigin(1, 0.5);

      this.add.text(width - 75, y, entry.survived ? 'Survived' : 'Out', {
        fontSize: '10px',
        color: entry.survived ? '#2ecc71' : '#e74c3c',
      }).setOrigin(1, 0.5);
    });

    // Play Again button — fixed at bottom
    const btnY = height - 45;
    const btn = this.add.rectangle(width / 2, btnY, 200, 44, 0x3498db)
      .setInteractive({ useHandCursor: true });
    this.add.text(width / 2, btnY, 'Play Again', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      window.location.href = '/join';
    });
    btn.on('pointerover', () => btn.setFillStyle(0x2980b9));
    btn.on('pointerout', () => btn.setFillStyle(0x3498db));
  }

  private createPodiumEntry(x: number, baseY: number, entry: LeaderboardEntry, color: string, podiumHeight: number, podiumWidth: number): void {
    // Podium block
    const block = this.add.rectangle(x, baseY + 40 + podiumHeight / 2, podiumWidth, podiumHeight,
      Phaser.Display.Color.HexStringToColor(color).color, 0.8);

    // Animate rising
    block.setScale(1, 0).setOrigin(0.5, 0);
    this.tweens.add({
      targets: block,
      scaleY: 1,
      duration: 600,
      ease: 'Bounce.easeOut',
      delay: entry.rank === 1 ? 400 : entry.rank === 2 ? 200 : 0,
    });

    // Player avatar above podium
    const skins = ['p1_stand', 'p2_stand', 'p3_stand'];
    const skinKey = skins[(entry.rank - 1) % skins.length];
    const avatar = this.add.image(x, baseY + 10, skinKey).setScale(0.5);
    avatar.setAlpha(0);
    this.tweens.add({
      targets: avatar,
      alpha: 1,
      y: baseY + 15,
      duration: 400,
      delay: entry.rank === 1 ? 800 : entry.rank === 2 ? 600 : 400,
    });

    // Rank
    this.add.text(x, baseY + 50, `#${entry.rank}`, {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Name below podium
    const nameText = entry.displayName.length > 10
      ? entry.displayName.slice(0, 9) + '…'
      : entry.displayName;
    this.add.text(x, baseY + 40 + podiumHeight + 8, nameText, {
      fontSize: '10px',
      color: '#cccccc',
    }).setOrigin(0.5);

    // Score
    this.add.text(x, baseY + 40 + podiumHeight + 22, `${entry.score}`, {
      fontSize: '10px',
      color: '#ffaa00',
    }).setOrigin(0.5);
  }
}
