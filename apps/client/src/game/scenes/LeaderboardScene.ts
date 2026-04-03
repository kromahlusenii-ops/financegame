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
      fontSize: '28px',
      color: '#ffaa00',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Podium
    if (leaderboard.length >= 1) {
      this.createPodiumEntry(width / 2, 180, leaderboard[0], '#ffd700', 120);
    }
    if (leaderboard.length >= 2) {
      this.createPodiumEntry(width / 2 - 120, 210, leaderboard[1], '#c0c0c0', 90);
    }
    if (leaderboard.length >= 3) {
      this.createPodiumEntry(width / 2 + 120, 220, leaderboard[2], '#cd7f32', 80);
    }

    // Podium animation
    const podiumElements = this.children.list.filter(
      c => (c as Phaser.GameObjects.GameObject).getData?.('isPodium')
    );

    // Full leaderboard
    const startY = 300;
    const scrollable = this.add.container(0, 0);

    leaderboard.forEach((entry, i) => {
      const y = startY + i * 35;
      const isMe = entry.displayName === myPlayerId;

      const bg = this.add.rectangle(width / 2, y, width - 40, 30, isMe ? 0x2ecc71 : 0x2a2a4a, 0.8)
        .setOrigin(0.5);

      const rank = this.add.text(30, y, `#${entry.rank}`, {
        fontSize: '14px',
        color: '#888888',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5);

      const name = this.add.text(70, y, entry.displayName, {
        fontSize: '14px',
        color: isMe ? '#ffffff' : '#cccccc',
        fontStyle: isMe ? 'bold' : 'normal',
      }).setOrigin(0, 0.5);

      const score = this.add.text(width - 30, y, `${entry.score} pts`, {
        fontSize: '14px',
        color: '#ffaa00',
        fontStyle: 'bold',
      }).setOrigin(1, 0.5);

      const status = this.add.text(width - 100, y, entry.survived ? 'Survived' : 'Eliminated', {
        fontSize: '10px',
        color: entry.survived ? '#2ecc71' : '#e74c3c',
      }).setOrigin(1, 0.5);

      scrollable.add([bg, rank, name, score, status]);
    });

    // Play Again button
    const btnY = Math.max(startY + leaderboard.length * 35 + 30, height - 60);
    const btn = this.add.rectangle(width / 2, btnY, 200, 50, 0x3498db)
      .setInteractive({ useHandCursor: true });
    this.add.text(width / 2, btnY, 'Play Again', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      window.location.href = '/join';
    });
    btn.on('pointerover', () => btn.setFillStyle(0x2980b9));
    btn.on('pointerout', () => btn.setFillStyle(0x3498db));
  }

  private createPodiumEntry(x: number, baseY: number, entry: LeaderboardEntry, color: string, podiumHeight: number): void {
    // Podium block
    const block = this.add.rectangle(x, baseY + podiumHeight / 2, 80, podiumHeight, Phaser.Display.Color.HexStringToColor(color).color, 0.8)
      .setData('isPodium', true);

    // Animate rising
    block.setScale(1, 0);
    block.setOrigin(0.5, 0);
    this.tweens.add({
      targets: block,
      scaleY: 1,
      duration: 800,
      ease: 'Bounce.easeOut',
      delay: entry.rank === 1 ? 600 : entry.rank === 2 ? 300 : 0,
    });

    // Player avatar
    const avatar = this.add.rectangle(x, baseY - 30, 28, 36, 0x00ff88);
    avatar.setAlpha(0);
    this.tweens.add({
      targets: avatar,
      alpha: 1,
      y: baseY - 20,
      duration: 500,
      delay: entry.rank === 1 ? 1200 : entry.rank === 2 ? 900 : 600,
    });

    // Rank number
    this.add.text(x, baseY + 20, `#${entry.rank}`, {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Name
    this.add.text(x, baseY + podiumHeight + 10, entry.displayName, {
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Score
    this.add.text(x, baseY + podiumHeight + 28, `${entry.score} pts`, {
      fontSize: '11px',
      color: '#ffaa00',
    }).setOrigin(0.5);
  }
}
