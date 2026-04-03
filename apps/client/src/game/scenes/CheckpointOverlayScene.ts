import Phaser from 'phaser';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';

const OPTION_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71];

export default class CheckpointOverlayScene extends Phaser.Scene {
  private timerText!: Phaser.GameObjects.Text;
  private timerArc!: Phaser.GameObjects.Graphics;
  private secondsRemaining = 0;
  private totalSeconds = 0;
  private answered = false;
  private optionButtons: Phaser.GameObjects.Container[] = [];

  constructor() {
    super({ key: 'CheckpointOverlayScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const data = this.registry.get('checkpointData') as {
      checkpointIndex: number;
      question: string;
      options: string[];
      timerSeconds: number;
    };

    if (!data) return;

    this.answered = false;
    this.totalSeconds = data.timerSeconds;
    this.secondsRemaining = data.timerSeconds;

    // Semi-transparent backdrop
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);

    // Checkpoint badge
    this.add.text(width / 2, 40, `Checkpoint #${data.checkpointIndex + 1}`, {
      fontSize: '18px',
      color: '#ffaa00',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Timer
    this.timerArc = this.add.graphics();
    this.timerText = this.add.text(width / 2, 90, String(this.secondsRemaining), {
      fontSize: '36px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Question
    this.add.text(width / 2, 150, data.question, {
      fontSize: '16px',
      color: '#ffffff',
      wordWrap: { width: width - 60 },
      align: 'center',
    }).setOrigin(0.5, 0);

    // Options
    const optionStartY = 240;
    const optionHeight = 50;
    const optionWidth = Math.min(width - 40, 400);

    this.optionButtons = [];
    data.options.forEach((opt, i) => {
      const y = optionStartY + i * (optionHeight + 10);
      const container = this.add.container(width / 2, y);

      const bg = this.add.rectangle(0, 0, optionWidth, optionHeight, OPTION_COLORS[i], 0.8)
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(-optionWidth / 2 + 15, 0, `${String.fromCharCode(65 + i)}. ${opt}`, {
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5);

      container.add([bg, label]);
      this.optionButtons.push(container);

      bg.on('pointerdown', () => {
        if (!this.answered) {
          this.selectAnswer(i);
        }
      });
    });

    // Listen for broadcast results (checkpoint_results comes from server broadcast)
    const onMessage = this.registry.get('onMessage');
    if (onMessage) {
      onMessage((msg: {
        type: string;
        secondsRemaining?: number;
        correct?: boolean;
        correctIndex?: number;
        pointsAwarded?: number;
        livesRemaining?: number;
        newStatus?: string;
        fact?: string;
        eliminations?: { playerId: string; displayName: string }[];
        leaderboard?: unknown[];
        nextCheckpointIndex?: number;
        playersAlive?: number;
        finalLeaderboard?: unknown[];
      }) => {
        switch (msg.type) {
          case 'checkpoint_tick':
            this.secondsRemaining = msg.secondsRemaining || 0;
            this.updateTimer();
            break;
          case 'checkpoint_results':
            this.showCheckpointResults(msg);
            break;
          case 'game_resumed':
            this.closeOverlay();
            break;
          case 'session_ended':
            this.registry.set('finalLeaderboard', msg.finalLeaderboard);
            this.scene.stop('RunnerScene');
            this.scene.start('LeaderboardScene');
            break;
        }
      });
    }

    // Local countdown
    this.time.addEvent({
      delay: 1000,
      repeat: data.timerSeconds - 1,
      callback: () => {
        this.secondsRemaining--;
        this.updateTimer();
        if (this.secondsRemaining <= 0 && !this.answered) {
          this.autoSubmit();
        }
      },
    });
  }

  private updateTimer(): void {
    this.timerText.setText(String(Math.max(0, this.secondsRemaining)));
    if (this.secondsRemaining <= 5) {
      this.timerText.setColor('#ff4444');
    }

    // Draw timer ring
    const { width } = this.scale;
    this.timerArc.clear();
    const progress = this.secondsRemaining / this.totalSeconds;
    this.timerArc.lineStyle(4, this.secondsRemaining <= 5 ? 0xff4444 : 0x00ff88);
    this.timerArc.beginPath();
    this.timerArc.arc(
      width / 2, 90,
      25,
      Phaser.Math.DegToRad(-90),
      Phaser.Math.DegToRad(-90 + 360 * progress),
      false
    );
    this.timerArc.strokePath();
  }

  private async selectAnswer(index: number): Promise<void> {
    this.answered = true;

    // Highlight selected
    for (let i = 0; i < this.optionButtons.length; i++) {
      const bg = this.optionButtons[i].list[0] as Phaser.GameObjects.Rectangle;
      if (i === index) {
        bg.setStrokeStyle(3, 0xffffff);
      }
      bg.disableInteractive();
    }

    // Submit answer via HTTP POST
    const sessionId = this.registry.get('sessionId') as string;
    const playerId = this.registry.get('playerId') as string;

    try {
      const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, selectedIndex: index }),
      });

      if (res.ok) {
        const result = await res.json();
        // The HTTP response IS the answer_result
        this.showResult(result);
      }
    } catch {
      // Network error - answer may not have been recorded
    }
  }

  private autoSubmit(): void {
    // Time ran out without answering
    this.answered = true;
    for (const container of this.optionButtons) {
      const bg = container.list[0] as Phaser.GameObjects.Rectangle;
      bg.disableInteractive();
    }
  }

  private showResult(msg: {
    correct?: boolean;
    correctIndex?: number;
    fact?: string;
    newStatus?: string;
  }): void {
    const correctIdx = msg.correctIndex ?? 0;

    // Flash correct answer green
    for (let i = 0; i < this.optionButtons.length; i++) {
      const bg = this.optionButtons[i].list[0] as Phaser.GameObjects.Rectangle;
      if (i === correctIdx) {
        bg.setFillStyle(0x2ecc71, 1);
      } else {
        bg.setAlpha(0.4);
      }
    }

    const { width, height } = this.scale;

    if (msg.correct) {
      this.add.text(width / 2, height - 80, 'Correct!', {
        fontSize: '24px',
        color: '#2ecc71',
        fontStyle: 'bold',
      }).setOrigin(0.5);
    } else {
      this.add.text(width / 2, height - 100, 'Wrong!', {
        fontSize: '24px',
        color: '#e74c3c',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      if (msg.fact) {
        this.add.text(width / 2, height - 60, msg.fact, {
          fontSize: '12px',
          color: '#cccccc',
          wordWrap: { width: width - 40 },
          align: 'center',
        }).setOrigin(0.5);
      }
    }

    if (msg.newStatus === 'eliminated') {
      this.add.text(width / 2, height - 30, 'You have been eliminated!', {
        fontSize: '18px',
        color: '#ff4444',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      // Will transition to spectator after checkpoint_results
      this.registry.set('playerEliminated', true);
    }
  }

  private showCheckpointResults(msg: {
    eliminations?: { playerId: string; displayName: string }[];
    leaderboard?: unknown[];
  }): void {
    // Brief display of results, then close
    this.time.delayedCall(4000, () => {
      if (this.registry.get('playerEliminated')) {
        this.scene.stop('RunnerScene');
        this.scene.start('SpectatorScene');
      } else {
        this.closeOverlay();
      }
    });
  }

  private closeOverlay(): void {
    this.scene.stop();
    this.scene.resume('RunnerScene');
  }
}
