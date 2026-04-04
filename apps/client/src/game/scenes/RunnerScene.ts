import Phaser from 'phaser';

const TILE_SIZE = 70;
const GHOST_SKINS = ['p2', 'p3'];

interface GhostPlayer {
  sprite: Phaser.GameObjects.Sprite;
  targetX: number;
  skin: string;
}

export default class RunnerScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private bgImage!: Phaser.GameObjects.TileSprite;
  private grassLayer!: Phaser.GameObjects.TileSprite;
  private dirtLayer!: Phaser.GameObjects.TileSprite;
  private groundBody!: Phaser.Physics.Arcade.Image;
  private clouds: Phaser.GameObjects.Image[] = [];
  private ghosts = new Map<string, GhostPlayer>();
  private obstacles!: Phaser.Physics.Arcade.Group;
  private platforms!: Phaser.Physics.Arcade.Group;
  private collectibles!: Phaser.Physics.Arcade.Group;

  private scrollSpeed = 0;
  private isRunning = false;
  private gameStarted = false;
  private obstacleTimer = 0;
  private coinTrailTimer = 0;
  private obstaclesCleared = 0;
  private currentCheckpointIndex = 0;
  private positionBroadcastTimer = 0;

  // HUD
  private hearts: Phaser.GameObjects.Image[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private runScore = 0;

  // Start overlay
  private startOverlay: Phaser.GameObjects.GameObject[] = [];
  private checkpointFlag: Phaser.GameObjects.Image | null = null;
  private groundY = 0;

  // Variable-height jump state
  private isJumpHeld = false;
  private jumpHoldTime = 0;
  private readonly JUMP_INITIAL_VELOCITY = -420;
  private readonly JUMP_HOLD_FORCE = -1200;      // additional upward acceleration while held
  private readonly JUMP_HOLD_MAX_MS = 250;        // max hold duration in ms

  constructor() {
    super({ key: 'RunnerScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const groundY = height - TILE_SIZE;
    this.groundY = groundY;

    // === Background ===
    this.bgImage = this.add.tileSprite(0, 0, width, height, 'bgGrasslands')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(0);

    // Clouds
    this.clouds = [];
    const cloudKeys = ['cloud1', 'cloud2', 'cloud3'];
    for (let i = 0; i < 4; i++) {
      const cloud = this.add.image(
        Phaser.Math.Between(0, width + 200),
        Phaser.Math.Between(30, 120),
        cloudKeys[i % 3]
      ).setAlpha(0.6).setDepth(1).setScrollFactor(0).setScale(0.7);
      this.clouds.push(cloud);
    }

    // === Ground ===
    this.grassLayer = this.add.tileSprite(0, groundY, width, TILE_SIZE, 'grassMid')
      .setOrigin(0, 0).setDepth(5);
    this.dirtLayer = this.add.tileSprite(0, groundY + TILE_SIZE, width, TILE_SIZE, 'dirtCenter')
      .setOrigin(0, 0).setDepth(5);

    // Invisible thin ground collision platform at groundY
    // Using a rectangle zone with static physics body — top edge exactly at groundY
    const groundPlatform = this.add.rectangle(width / 2, groundY + 5, width * 3, 10, 0x000000, 0);
    this.physics.add.existing(groundPlatform, true); // true = static
    this.groundBody = groundPlatform as unknown as Phaser.Physics.Arcade.Image;

    // === Player ===
    // Player sprite is ~92px tall (p1_stand). Spawn above ground, gravity pulls them down.
    this.player = this.physics.add.sprite(120, groundY - 60, 'p1_stand')
      .setDepth(10).setCollideWorldBounds(true);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setGravityY(800);
    // Tighter hitbox: 40px wide, 70px tall, offset to center on sprite
    playerBody.setSize(40, 70);
    playerBody.setOffset(13, 20);
    this.physics.add.collider(this.player, groundPlatform);

    // === Obstacle group ===
    this.obstacles = this.physics.add.group({ runChildUpdate: false });
    this.platforms = this.physics.add.group({ runChildUpdate: false });
    this.collectibles = this.physics.add.group({ runChildUpdate: false });

    // Player can stand on platforms (collider, not overlap)
    this.physics.add.collider(this.player, this.platforms);

    // Obstacle collision → stumble
    this.physics.add.overlap(this.player, this.obstacles, (_p, obs) => {
      this.onPlayerHit();
      (obs as Phaser.GameObjects.GameObject).destroy();
    });

    // Collectible overlap → collect
    this.physics.add.overlap(this.player, this.collectibles, (_p, coin) => {
      this.collectItem(coin as Phaser.Physics.Arcade.Image);
    });

    // === Input ===
    this.input.on('pointerdown', () => {
      if (!this.gameStarted) {
        this.startGame();
      } else {
        this.jump();
      }
    });
    this.input.on('pointerup', () => {
      this.releaseJump();
    });

    const spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey?.on('down', () => {
      if (!this.gameStarted) {
        this.startGame();
      } else {
        this.jump();
      }
    });
    spaceKey?.on('up', () => {
      this.releaseJump();
    });

    // === HUD ===
    this.createHUD();

    // === Listen for messages ===
    const onMessage = this.registry.get('onMessage');
    if (onMessage) {
      onMessage((msg: any) => {
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

    // === Check if checkpoint already active ===
    const sessionState = this.registry.get('sessionState');
    if (sessionState?.session?.status === 'checkpoint_active' && sessionState.checkpoint) {
      this.gameStarted = true;
      this.freezeForCheckpoint({
        checkpointIndex: sessionState.checkpoint.checkpointIndex,
        question: sessionState.checkpoint.question,
        options: sessionState.checkpoint.options,
        timerSeconds: sessionState.checkpoint.timerSeconds,
      });
    } else {
      // Show start screen overlay
      this.showStartScreen();
    }
  }

  update(_time: number, delta: number): void {
    if (!this.isRunning || !this.gameStarted) return;

    // Variable-height jump: apply extra force while button is held
    if (this.isJumpHeld) {
      this.jumpHoldTime += delta;
      if (this.jumpHoldTime < this.JUMP_HOLD_MAX_MS) {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setVelocityY(body.velocity.y + (this.JUMP_HOLD_FORCE * delta) / 1000);
      } else {
        this.isJumpHeld = false;
      }
    }

    const speed = 200 + this.currentCheckpointIndex * 15;
    this.scrollSpeed = speed;

    // Scroll layers
    this.bgImage.tilePositionX += (speed * 0.1 * delta) / 1000;
    this.grassLayer.tilePositionX += (speed * delta) / 1000;
    this.dirtLayer.tilePositionX += (speed * delta) / 1000;

    // Scroll clouds
    for (const cloud of this.clouds) {
      cloud.x -= (speed * 0.2 * delta) / 1000;
      if (cloud.x < -150) {
        cloud.x = this.scale.width + Phaser.Math.Between(50, 200);
        cloud.y = Phaser.Math.Between(30, 120);
      }
    }

    // Clean up off-screen obstacles & platforms
    this.obstacles.getChildren().forEach((obs) => {
      const img = obs as Phaser.Physics.Arcade.Image;
      if (img.x < -100) {
        img.destroy();
        this.obstaclesCleared++;
      }
    });
    this.platforms.getChildren().forEach((p) => {
      const img = p as Phaser.Physics.Arcade.Image;
      if (img.x < -100) img.destroy();
    });
    this.collectibles.getChildren().forEach((c) => {
      const img = c as Phaser.Physics.Arcade.Image;
      if (img.x < -100) img.destroy();
    });

    // Spawn obstacles (faster interval for more Mario-like feel)
    this.obstacleTimer += delta;
    if (this.obstacleTimer > 1800) {
      this.obstacleTimer = 0;
      this.spawnObstacle();
    }

    // Spawn coin trails between obstacles
    this.coinTrailTimer += delta;
    if (this.coinTrailTimer > 1200) {
      this.coinTrailTimer = 0;
      this.spawnCoinPattern();
    }

    // Landing detection
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.touching.down && this.player.texture.key === 'p1_jump') {
      this.tweens.add({
        targets: this.player,
        scaleY: 0.85, scaleX: 1.15,
        duration: 80, yoyo: true,
        onComplete: () => this.player.play('p1_run'),
      });
    }

    // Position broadcast (no-op in polling mode but keep interface)
    this.positionBroadcastTimer += delta;
    if (this.positionBroadcastTimer >= 100) {
      this.positionBroadcastTimer = 0;
      const trackPosition = this.registry.get('trackPosition');
      const playerId = this.registry.get('playerId') as string;
      if (trackPosition && playerId) {
        trackPosition(playerId, this.player.x);
      }
    }

    // Ghost interpolation
    for (const ghost of this.ghosts.values()) {
      ghost.sprite.x += (ghost.targetX - ghost.sprite.x) * 0.1;
    }
  }

  // === Start Screen ===
  private showStartScreen(): void {
    const { width, height } = this.scale;

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.4)
      .setOrigin(0).setDepth(40).setScrollFactor(0);

    const isMobile = this.sys.game.device.input.touch;
    const text = this.add.text(width / 2, height / 2 - 40,
      isMobile ? 'TAP TO JUMP' : 'PRESS SPACE TO JUMP', {
        fontSize: '24px',
        color: '#FFFFFF',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5).setDepth(42).setScrollFactor(0);

    this.tweens.add({
      targets: text,
      alpha: 0.4,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    this.startOverlay = [overlay, text];
  }

  private startGame(): void {
    this.gameStarted = true;
    this.isRunning = true;
    this.scrollSpeed = 200;
    this.player.play('p1_run');

    // Spawn first obstacle quickly
    this.obstacleTimer = 2000;

    for (const obj of this.startOverlay) {
      this.tweens.add({
        targets: obj,
        alpha: 0,
        duration: 300,
        onComplete: () => (obj as Phaser.GameObjects.GameObject).destroy(),
      });
    }
    this.startOverlay = [];
  }

  // === HUD ===
  private createHUD(): void {
    // Hearts
    for (let i = 0; i < 2; i++) {
      const heart = this.add.image(30 + i * 40, 30, 'heartFull')
        .setScale(0.5).setScrollFactor(0).setDepth(50);
      this.hearts.push(heart);
    }

    // Score – top center, large and prominent
    this.add.image(this.scale.width / 2 - 30, 16, 'hudCoins')
      .setScale(0.5).setScrollFactor(0).setDepth(50);
    this.scoreText = this.add.text(this.scale.width / 2, 6, '0', {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 4,
    }).setScrollFactor(0).setDepth(50);
  }

  private updateHUD(): void {
    this.scoreText.setText(String(this.runScore));
  }

  // === Jump (variable height: hold longer to jump higher) ===
  private jump(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.touching.down || body.onFloor()) {
      body.setVelocityY(this.JUMP_INITIAL_VELOCITY);
      this.isJumpHeld = true;
      this.jumpHoldTime = 0;
      this.player.stop();
      this.player.setTexture('p1_jump');
      this.tweens.add({
        targets: this.player,
        scaleY: 1.1, scaleX: 0.9,
        duration: 100, yoyo: true,
      });
    }
  }

  private releaseJump(): void {
    if (this.isJumpHeld) {
      this.isJumpHeld = false;
      // Cut upward velocity on early release for a short hop
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      if (body.velocity.y < 0) {
        body.setVelocityY(body.velocity.y * 0.5);
      }
    }
  }

  // === Obstacles ===
  private spawnObstacle(): void {
    const { width } = this.scale;
    const groundY = this.groundY;
    const spawnX = width + 100;

    const cleared = this.obstaclesCleared;
    let maxTier = 1;
    if (cleared >= 12) maxTier = 4;
    else if (cleared >= 5) maxTier = 3;
    else if (cleared >= 2) maxTier = 2;

    const roll = Math.random();
    let obsType: string;

    if (maxTier >= 4 && roll < 0.10) {
      obsType = 'slime';
    } else if (maxTier >= 3 && roll < 0.20) {
      obsType = 'fly';
    } else if (maxTier >= 3 && roll < 0.30) {
      obsType = 'doubleBox';
    } else if (maxTier >= 2 && roll < 0.45) {
      obsType = 'platform';
    } else if (maxTier >= 2 && roll < 0.55) {
      obsType = 'coinBox';
    } else if (roll < 0.70) {
      obsType = 'mushroom';
    } else if (roll < 0.85) {
      obsType = 'spikes';
    } else {
      obsType = 'box';
    }

    const speed = this.scrollSpeed || 200;

    switch (obsType) {
      case 'box': {
        const obs = this.physics.add.image(spawnX, groundY - 35, 'box').setDepth(8);
        this.obstacles.add(obs);
        (obs.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        (obs.body as Phaser.Physics.Arcade.Body).setVelocityX(-speed);
        break;
      }
      case 'spikes': {
        const obs = this.physics.add.image(spawnX, groundY - 25, 'spikes').setDepth(8).setScale(0.6);
        this.obstacles.add(obs);
        (obs.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        (obs.body as Phaser.Physics.Arcade.Body).setVelocityX(-speed);
        (obs.body as Phaser.Physics.Arcade.Body).setSize(40, 30);
        break;
      }
      case 'doubleBox': {
        for (let i = 0; i < 2; i++) {
          const obs = this.physics.add.image(spawnX, groundY - 35 - i * 70, 'boxExplosive').setDepth(8);
          this.obstacles.add(obs);
          (obs.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
          (obs.body as Phaser.Physics.Arcade.Body).setVelocityX(-speed);
        }
        break;
      }
      case 'slime': {
        const slime = this.physics.add.sprite(spawnX, groundY - 14, 'slimeWalk1').setDepth(8);
        slime.play('slime_walk');
        this.obstacles.add(slime);
        (slime.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        (slime.body as Phaser.Physics.Arcade.Body).setVelocityX(-speed * 0.7);
        break;
      }
      case 'fly': {
        const flyY = groundY - Phaser.Math.Between(70, 130);
        const fly = this.physics.add.sprite(spawnX, flyY, 'flyFly1').setDepth(8);
        fly.play('fly_hover');
        this.obstacles.add(fly);
        (fly.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        (fly.body as Phaser.Physics.Arcade.Body).setVelocityX(-speed);
        this.tweens.add({
          targets: fly,
          y: fly.y - 15,
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;
      }
      // --- New jumpable types ---
      case 'platform': {
        // Floating grass platform the player can land on, with coins on top
        const platY = groundY - Phaser.Math.Between(90, 150);
        const tiles = ['grassHalfLeft', 'grassHalfMid', 'grassHalfRight'];
        for (let i = 0; i < 3; i++) {
          const tile = this.physics.add.image(spawnX + i * 70, platY, tiles[i]).setDepth(8);
          this.platforms.add(tile);
          const body = tile.body as Phaser.Physics.Arcade.Body;
          body.setAllowGravity(false);
          body.setVelocityX(-speed);
          body.setImmovable(true);
        }
        // Coins on top of platform
        for (let i = 0; i < 3; i++) {
          this.spawnCoin(spawnX + i * 70, platY - 40, speed);
        }
        break;
      }
      case 'coinBox': {
        // Mario-style ? box — player can stand on it, coins above
        const boxY = groundY - Phaser.Math.Between(80, 120);
        const cBox = this.physics.add.image(spawnX, boxY, 'boxCoin').setDepth(8);
        this.platforms.add(cBox);
        const cBody = cBox.body as Phaser.Physics.Arcade.Body;
        cBody.setAllowGravity(false);
        cBody.setVelocityX(-speed);
        cBody.setImmovable(true);
        // Coins above the box
        this.spawnCoin(spawnX, boxY - 50, speed);
        this.spawnCoin(spawnX, boxY - 90, speed);
        break;
      }
      case 'mushroom': {
        // Mushroom on the ground — player can jump on it
        const mush = this.physics.add.image(spawnX, groundY - 20, 'mushroomRed').setDepth(8);
        this.platforms.add(mush);
        const mBody = mush.body as Phaser.Physics.Arcade.Body;
        mBody.setAllowGravity(false);
        mBody.setVelocityX(-speed);
        mBody.setImmovable(true);
        // Coin arc above mushroom
        for (let i = 0; i < 3; i++) {
          const arcY = groundY - 80 - Math.sin((i / 2) * Math.PI) * 50;
          this.spawnCoin(spawnX + i * 50, arcY, speed);
        }
        break;
      }
    }

    // Spawn collectible near obstacle (for non-platform types)
    if (!['platform', 'coinBox', 'mushroom'].includes(obsType)) {
      this.maybeSpawnCollectible(spawnX, groundY);
    }
  }

  // === Collectibles ===
  private spawnCoin(x: number, y: number, speed: number, key = 'coinGold', pts = 10): void {
    const coin = this.physics.add.image(x, y, key).setDepth(9).setScale(0.5);
    coin.setData('points', pts);
    this.collectibles.add(coin);
    (coin.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    (coin.body as Phaser.Physics.Arcade.Body).setVelocityX(-speed);

    this.tweens.add({
      targets: coin,
      y: coin.y - 8,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private spawnCoinPattern(): void {
    const { width } = this.scale;
    const groundY = this.groundY;
    const speed = this.scrollSpeed || 200;
    const spawnX = width + 80;

    const roll = Math.random();

    if (roll < 0.35) {
      // Horizontal trail of coins at ground level
      const y = groundY - Phaser.Math.Between(60, 100);
      const count = Phaser.Math.Between(3, 6);
      for (let i = 0; i < count; i++) {
        this.spawnCoin(spawnX + i * 45, y, speed);
      }
    } else if (roll < 0.60) {
      // Coin arc (jump arc shape)
      const count = 5;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const arcY = groundY - 60 - Math.sin(t * Math.PI) * 100;
        this.spawnCoin(spawnX + i * 40, arcY, speed);
      }
    } else if (roll < 0.80) {
      // Vertical column of coins
      for (let i = 0; i < 4; i++) {
        this.spawnCoin(spawnX, groundY - 50 - i * 35, speed);
      }
    } else {
      // Gem with surrounding coins (rare bonus cluster)
      const y = groundY - Phaser.Math.Between(80, 130);
      this.spawnCoin(spawnX, y, speed, 'gemBlue', 25);
      this.spawnCoin(spawnX - 35, y, speed);
      this.spawnCoin(spawnX + 35, y, speed);
      this.spawnCoin(spawnX, y - 35, speed);
    }
  }

  private maybeSpawnCollectible(x: number, groundY: number): void {
    const roll = Math.random();
    let key: string;
    let pts: number;

    if (roll < 0.45) { key = 'coinGold'; pts = 10; }
    else if (roll < 0.65) { key = 'coinSilver'; pts = 5; }
    else if (roll < 0.75) { key = 'gemBlue'; pts = 25; }
    else if (roll < 0.80) { key = 'gemRed'; pts = 50; }
    else { return; }

    const speed = this.scrollSpeed || 200;
    this.spawnCoin(x + Phaser.Math.Between(-30, 60), groundY - 120, speed, key, pts);
  }

  private collectItem(coin: Phaser.Physics.Arcade.Image): void {
    const pts = coin.getData('points') as number;
    this.runScore += pts;
    this.updateHUD();

    // Popup text
    const popup = this.add.text(coin.x, coin.y, `+${pts}`, {
      fontSize: '16px',
      color: pts >= 25 ? '#FFD700' : '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 2,
    }).setDepth(20);

    this.tweens.add({
      targets: popup,
      y: popup.y - 40,
      alpha: 0,
      duration: 600,
      onComplete: () => popup.destroy(),
    });

    // Collect animation
    this.tweens.add({
      targets: coin,
      scaleX: 1.2, scaleY: 1.2,
      alpha: 0,
      duration: 150,
      onComplete: () => coin.destroy(),
    });
  }

  // === Hit ===
  private onPlayerHit(): void {
    this.player.stop();
    this.player.setTexture('p1_hurt');
    this.cameras.main.shake(200, 0.005);

    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 100,
      repeat: 3,
      yoyo: true,
      onComplete: () => {
        this.player.setAlpha(1);
        if (this.isRunning) this.player.play('p1_run');
      },
    });
  }

  // === Ghosts ===
  private updateGhosts(positions: { playerId: string; positionX: number }[]): void {
    const myPlayerId = this.registry.get('playerId') as string;
    const groundY = this.groundY;

    for (const pos of positions) {
      if (pos.playerId === myPlayerId) continue;

      if (!this.ghosts.has(pos.playerId)) {
        const skinIdx = this.ghosts.size % GHOST_SKINS.length;
        const skin = GHOST_SKINS[skinIdx];
        const sprite = this.add.sprite(pos.positionX, groundY - 48, `${skin}_stand`)
          .setAlpha(0.4).setDepth(7);
        sprite.play(`${skin}_run`);
        this.ghosts.set(pos.playerId, { sprite, targetX: pos.positionX, skin });
      } else {
        this.ghosts.get(pos.playerId)!.targetX = pos.positionX;
      }
    }
  }

  // === Checkpoint ===
  private freezeForCheckpoint(msg: {
    checkpointIndex?: number;
    question?: string;
    options?: string[];
    timerSeconds?: number;
  }): void {
    this.isRunning = false;
    this.currentCheckpointIndex = msg.checkpointIndex || 0;

    // Stop player
    this.player.stop();
    this.player.setTexture('p1_stand');

    // Stop all obstacles, platforms, and collectibles
    this.obstacles.getChildren().forEach((obs) => {
      (obs.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
    });
    this.platforms.getChildren().forEach((p) => {
      (p.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
    });
    this.collectibles.getChildren().forEach((c) => {
      (c.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
    });

    // Slide flag in
    const { width } = this.scale;
    this.checkpointFlag = this.add.image(width + 50, this.groundY - 35, 'flagRed').setDepth(15);
    this.tweens.add({
      targets: this.checkpointFlag,
      x: this.player.x + 60,
      duration: 500,
      ease: 'Power2',
    });

    // Store checkpoint data and launch overlay
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
    this.player.play('p1_run');

    // Remove flag
    if (this.checkpointFlag) {
      this.tweens.add({
        targets: this.checkpointFlag,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          this.checkpointFlag?.destroy();
          this.checkpointFlag = null;
        },
      });
    }

    this.scene.resume();
  }
}
