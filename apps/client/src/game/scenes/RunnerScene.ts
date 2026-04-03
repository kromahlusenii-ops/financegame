import Phaser from 'phaser';

interface GhostPlayer {
  sprite: Phaser.GameObjects.Rectangle;
  targetX: number;
}

export default class RunnerScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private ground!: Phaser.GameObjects.TileSprite;
  private bgLayers: Phaser.GameObjects.TileSprite[] = [];
  private ghosts = new Map<string, GhostPlayer>();
  private scrollSpeed = 200;
  private isRunning = true;
  private positionBroadcastTimer = 0;
  private obstacles: Phaser.GameObjects.Rectangle[] = [];
  private obstacleTimer = 0;
  private currentCheckpointIndex = 0;

  constructor() {
    super({ key: 'RunnerScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Parallax backgrounds
    const bg1 = this.add.tileSprite(0, 0, width, height, 'sky1')
      .setOrigin(0, 0).setAlpha(0.8).setScrollFactor(0);
    const bg2 = this.add.tileSprite(0, 0, width, height, 'sky2')
      .setOrigin(0, 0).setAlpha(0.5).setScrollFactor(0);
    const bg3 = this.add.tileSprite(0, 0, width, height, 'sky3')
      .setOrigin(0, 0).setAlpha(0.3).setScrollFactor(0);
    this.bgLayers = [bg1, bg2, bg3];

    // Ground
    this.ground = this.add.tileSprite(0, height - 32, width * 2, 32, 'ground')
      .setOrigin(0, 0);
    this.physics.add.existing(this.ground, true);

    // Player
    this.player = this.add.rectangle(100, height - 68, 28, 36, 0x00ff88);
    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCollideWorldBounds(true);

    // Eyes
    this.add.circle(92, -10, 3, 0x000000).setScrollFactor(0);

    // Collision with ground
    this.physics.add.collider(this.player, this.ground);

    // Input - jump
    this.input.on('pointerdown', () => this.jump());
    const spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey?.on('down', () => this.jump());

    // Listen for WS messages
    const onMessage = this.registry.get('onMessage');
    if (onMessage) {
      onMessage((msg: {
        type: string;
        positions?: { playerId: string; positionX: number }[];
        checkpointIndex?: number;
        question?: string;
        options?: string[];
        timerSeconds?: number;
        playersAlive?: number;
        nextCheckpointIndex?: number;
        finalLeaderboard?: unknown[];
      }) => {
        switch (msg.type) {
          case 'player_positions':
            this.updateGhosts(msg.positions || []);
            break;
          case 'checkpoint_start':
            this.freezeForCheckpoint(msg);
            break;
          case 'game_resumed':
            this.resumeRunning();
            break;
          case 'session_ended':
            this.registry.set('finalLeaderboard', msg.finalLeaderboard);
            this.scene.start('LeaderboardScene');
            break;
          case 'session_paused':
            this.isRunning = false;
            break;
          case 'session_unpaused':
            this.isRunning = true;
            break;
        }
      });
    }
  }

  update(_time: number, delta: number): void {
    if (!this.isRunning) return;

    const speed = 200 + (this.currentCheckpointIndex * 10);
    this.scrollSpeed = speed;

    // Scroll ground
    this.ground.tilePositionX += (speed * delta) / 1000;

    // Parallax
    this.bgLayers[0].tilePositionX += (speed * 0.1 * delta) / 1000;
    this.bgLayers[1].tilePositionX += (speed * 0.3 * delta) / 1000;
    this.bgLayers[2].tilePositionX += (speed * 0.5 * delta) / 1000;

    // Move obstacles
    for (const obs of this.obstacles) {
      obs.x -= (speed * delta) / 1000;
      if (obs.x < -50) {
        obs.destroy();
        this.obstacles = this.obstacles.filter(o => o !== obs);
      }
    }

    // Spawn obstacles periodically
    this.obstacleTimer += delta;
    if (this.obstacleTimer > 3000) {
      this.obstacleTimer = 0;
      this.spawnObstacle();
    }

    // Check obstacle collisions (stumble only, no life loss)
    for (const obs of this.obstacles) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(
        this.player.getBounds(),
        obs.getBounds()
      )) {
        this.stumble();
        obs.destroy();
        this.obstacles = this.obstacles.filter(o => o !== obs);
      }
    }

    // Broadcast position at 10Hz via Presence
    this.positionBroadcastTimer += delta;
    if (this.positionBroadcastTimer >= 100) {
      this.positionBroadcastTimer = 0;
      const trackPosition = this.registry.get('trackPosition');
      const playerId = this.registry.get('playerId') as string;
      if (trackPosition && playerId) {
        trackPosition(playerId, this.player.x);
      }
    }

    // Interpolate ghosts
    for (const ghost of this.ghosts.values()) {
      ghost.sprite.x += (ghost.targetX - ghost.sprite.x) * 0.1;
    }
  }

  private jump(): void {
    if (this.playerBody.blocked.down) {
      this.playerBody.setVelocityY(-400);
    }
  }

  private spawnObstacle(): void {
    const { width, height } = this.scale;
    const isBarrier = Math.random() > 0.5;

    if (isBarrier) {
      const barrier = this.add.rectangle(width + 50, height - 62, 32, 60, 0xff4444);
      this.obstacles.push(barrier);
    } else {
      // Gap in ground (visual only)
      const gap = this.add.rectangle(width + 50, height - 16, 60, 4, 0x000000);
      this.obstacles.push(gap);
    }
  }

  private stumble(): void {
    // Screen shake + character flash
    this.cameras.main.shake(200, 0.005);
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: 3,
    });
  }

  private updateGhosts(positions: { playerId: string; positionX: number }[]): void {
    const myPlayerId = this.registry.get('playerId') as string;
    const { height } = this.scale;

    for (const pos of positions) {
      if (pos.playerId === myPlayerId) continue;

      if (!this.ghosts.has(pos.playerId)) {
        const sprite = this.add.rectangle(pos.positionX, height - 68, 28, 36, 0x888888)
          .setAlpha(0.4);
        this.ghosts.set(pos.playerId, { sprite, targetX: pos.positionX });
      } else {
        const ghost = this.ghosts.get(pos.playerId)!;
        ghost.targetX = pos.positionX;
      }
    }
  }

  private freezeForCheckpoint(msg: {
    checkpointIndex?: number;
    question?: string;
    options?: string[];
    timerSeconds?: number;
  }): void {
    this.isRunning = false;
    this.currentCheckpointIndex = msg.checkpointIndex || 0;

    // Store checkpoint data for overlay
    this.registry.set('checkpointData', {
      checkpointIndex: msg.checkpointIndex,
      question: msg.question,
      options: msg.options,
      timerSeconds: msg.timerSeconds,
    });

    this.scene.launch('CheckpointOverlayScene');
    this.scene.pause();
  }

  private resumeRunning(): void {
    this.isRunning = true;
    this.scene.resume();
  }
}
