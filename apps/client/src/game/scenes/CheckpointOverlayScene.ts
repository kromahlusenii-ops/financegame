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
  private resultGroup: Phaser.GameObjects.Group | null = null;

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
    this.resultGroup = this.add.group();

    // Semi-transparent backdrop
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);

    // Checkpoint badge — pushed down from top for mobile safe area
    const topOffset = 60;

    this.add.text(width / 2, topOffset, `Checkpoint #${data.checkpointIndex + 1}`, {
      fontSize: '16px',
      color: '#ffaa00',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Timer
    this.timerArc = this.add.graphics();
    this.timerText = this.add.text(width / 2, topOffset + 50, String(this.secondsRemaining), {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Question — with word wrap
    this.add.text(width / 2, topOffset + 100, data.question, {
      fontSize: '15px',
      color: '#ffffff',
      wordWrap: { width: width - 40 },
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5, 0);

    // Options — positioned in lower half of screen
    const optionStartY = Math.max(topOffset + 180, height * 0.4);
    const optionHeight = 50;
    const optionGap = 8;
    const optionWidth = Math.min(width - 30, 420);

    this.optionButtons = [];
    data.options.forEach((opt, i) => {
      const y = optionStartY + i * (optionHeight + optionGap);
      const container = this.add.container(width / 2, y);

      const bg = this.add.rectangle(0, 0, optionWidth, optionHeight, OPTION_COLORS[i], 0.9)
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(-optionWidth / 2 + 15, 0, `${String.fromCharCode(65 + i)}. ${opt}`, {
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
        wordWrap: { width: optionWidth - 30 },
      }).setOrigin(0, 0.5);

      container.add([bg, label]);
      this.optionButtons.push(container);

      bg.on('pointerdown', () => {
        if (!this.answered) {
          this.selectAnswer(i);
        }
      });
    });

    // Listen for checkpoint_results from polling
    const onMessage = this.registry.get('onMessage');
    if (onMessage) {
      onMessage((msg: any) => {
        switch (msg.type) {
          case 'checkpoint_results':
            this.showCheckpointResults(msg);
            break;
          case 'session_ended':
            this.registry.set('finalLeaderboard', msg.finalLeaderboard);
            this.scene.stop('RunnerScene');
            this.scene.start('LeaderboardScene');
            break;
        }
      });
    }

    // Local countdown timer
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

    const { width } = this.scale;
    const topOffset = 60;
    this.timerArc.clear();
    const progress = this.secondsRemaining / this.totalSeconds;
    this.timerArc.lineStyle(4, this.secondsRemaining <= 5 ? 0xff4444 : 0x00ff88);
    this.timerArc.beginPath();
    this.timerArc.arc(
      width / 2, topOffset + 50,
      25,
      Phaser.Math.DegToRad(-90),
      Phaser.Math.DegToRad(-90 + 360 * progress),
      false
    );
    this.timerArc.strokePath();
  }

  private async selectAnswer(index: number): Promise<void> {
    this.answered = true;

    // Highlight selected, disable all
    for (let i = 0; i < this.optionButtons.length; i++) {
      const bg = this.optionButtons[i].list[0] as Phaser.GameObjects.Rectangle;
      if (i === index) {
        bg.setStrokeStyle(3, 0xffffff);
      }
      bg.disableInteractive();
    }

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
        this.showResult(result);
      }
    } catch {
      // Network error
    }
  }

  private autoSubmit(): void {
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
    const { width } = this.scale;

    // Flash correct answer green, fade others
    for (let i = 0; i < this.optionButtons.length; i++) {
      const bg = this.optionButtons[i].list[0] as Phaser.GameObjects.Rectangle;
      if (i === correctIdx) {
        bg.setFillStyle(0x2ecc71, 1);
      } else {
        bg.setAlpha(0.3);
      }
    }

    // Result text — positioned between options and bottom
    const lastOptionY = this.optionButtons[this.optionButtons.length - 1]?.y ?? 400;
    const resultY = lastOptionY + 60;

    if (msg.correct) {
      const t = this.add.text(width / 2, resultY, 'Correct!', {
        fontSize: '22px',
        color: '#2ecc71',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.resultGroup?.add(t);
    } else {
      const t = this.add.text(width / 2, resultY, 'Wrong!', {
        fontSize: '22px',
        color: '#e74c3c',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.resultGroup?.add(t);

      if (msg.fact) {
        const f = this.add.text(width / 2, resultY + 30, msg.fact, {
          fontSize: '11px',
          color: '#aaaaaa',
          wordWrap: { width: width - 40 },
          align: 'center',
        }).setOrigin(0.5, 0);
        this.resultGroup?.add(f);
      }
    }

    if (msg.newStatus === 'eliminated') {
      const e = this.add.text(width / 2, resultY + 70, 'You have been eliminated!', {
        fontSize: '16px',
        color: '#ff4444',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.resultGroup?.add(e);
      this.registry.set('playerEliminated', true);
    }
  }

  private showCheckpointResults(_msg: any): void {
    this.time.delayedCall(3000, () => {
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
