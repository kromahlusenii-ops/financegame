import Phaser from 'phaser';

const BASE = 'assets/kenney/base';
const MUSH = 'assets/kenney/mushroom';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 100, height / 2, 0, 20, 0x00ff88);
    this.load.on('progress', (v: number) => {
      bar.width = 200 * v;
    });
    this.add.text(width / 2, height / 2 - 30, 'Loading...', {
      fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5);

    // Player 1
    this.load.image('p1_stand', `${BASE}/Player/p1_stand.png`);
    this.load.image('p1_jump', `${BASE}/Player/p1_jump.png`);
    this.load.image('p1_hurt', `${BASE}/Player/p1_hurt.png`);
    for (let i = 1; i <= 11; i++) {
      const n = i.toString().padStart(2, '0');
      this.load.image(`p1_walk${n}`, `${BASE}/Player/p1_walk/PNG/p1_walk${n}.png`);
    }

    // Player 2 (ghost skin)
    this.load.image('p2_stand', `${BASE}/Player/p2_stand.png`);
    this.load.image('p2_jump', `${BASE}/Player/p2_jump.png`);
    for (let i = 1; i <= 11; i++) {
      const n = i.toString().padStart(2, '0');
      this.load.image(`p2_walk${n}`, `${BASE}/Player/p2_walk/PNG/p2_walk${n}.png`);
    }

    // Player 3 (ghost skin)
    this.load.image('p3_stand', `${BASE}/Player/p3_stand.png`);
    this.load.image('p3_jump', `${BASE}/Player/p3_jump.png`);
    for (let i = 1; i <= 11; i++) {
      const n = i.toString().padStart(2, '0');
      this.load.image(`p3_walk${n}`, `${BASE}/Player/p3_walk/PNG/p3_walk${n}.png`);
    }

    // Ground tiles (70x70)
    this.load.image('grassMid', `${BASE}/Tiles/grassMid.png`);
    this.load.image('dirtCenter', `${BASE}/Tiles/dirtCenter.png`);
    this.load.image('grassCliffLeft', `${BASE}/Tiles/grassCliffLeft.png`);
    this.load.image('grassCliffRight', `${BASE}/Tiles/grassCliffRight.png`);

    // Obstacles
    this.load.image('box', `${BASE}/Tiles/box.png`);
    this.load.image('boxCoin', `${BASE}/Tiles/boxCoin.png`);
    this.load.image('boxCoinDisabled', `${BASE}/Tiles/boxCoinAlt_disabled.png`);
    this.load.image('boxExplosive', `${BASE}/Tiles/boxExplosive.png`);
    this.load.image('spikes', `${BASE}/Items/spikes.png`);
    this.load.image('rock', `${BASE}/Items/rock.png`);

    // Platforms (jumpable)
    this.load.image('grassHalfLeft', `${BASE}/Tiles/grassHalfLeft.png`);
    this.load.image('grassHalfMid', `${BASE}/Tiles/grassHalfMid.png`);
    this.load.image('grassHalfRight', `${BASE}/Tiles/grassHalfRight.png`);
    this.load.image('mushroomRed', `${BASE}/Items/mushroomRed.png`);
    this.load.image('springboardUp', `${BASE}/Items/springboardUp.png`);

    // Enemies
    this.load.image('slimeWalk1', `${BASE}/Enemies/slimeWalk1.png`);
    this.load.image('slimeWalk2', `${BASE}/Enemies/slimeWalk2.png`);
    this.load.image('flyFly1', `${BASE}/Enemies/flyFly1.png`);
    this.load.image('flyFly2', `${BASE}/Enemies/flyFly2.png`);

    // Collectibles
    this.load.image('coinGold', `${BASE}/Items/coinGold.png`);
    this.load.image('coinSilver', `${BASE}/Items/coinSilver.png`);
    this.load.image('gemBlue', `${BASE}/Items/gemBlue.png`);
    this.load.image('gemRed', `${BASE}/Items/gemRed.png`);
    this.load.image('star', `${BASE}/Items/star.png`);

    // HUD
    this.load.image('heartFull', `${BASE}/HUD/hud_heartFull.png`);
    this.load.image('heartEmpty', `${BASE}/HUD/hud_heartEmpty.png`);
    this.load.image('hudCoins', `${BASE}/HUD/hud_coins.png`);

    // Backgrounds
    this.load.image('bgGrasslands', `${MUSH}/Backgrounds/bg_grasslands.png`);

    // Decoration
    this.load.image('cloud1', `${BASE}/Items/cloud1.png`);
    this.load.image('cloud2', `${BASE}/Items/cloud2.png`);
    this.load.image('cloud3', `${BASE}/Items/cloud3.png`);
    this.load.image('bush', `${BASE}/Items/bush.png`);
    this.load.image('plant', `${BASE}/Items/plant.png`);
    this.load.image('flagRed', `${BASE}/Items/flagRed.png`);
    this.load.image('flagGreen', `${BASE}/Items/flagGreen.png`);
  }

  create(): void {
    // Walk animations
    this.anims.create({
      key: 'p1_run',
      frames: Array.from({ length: 11 }, (_, i) => ({
        key: `p1_walk${(i + 1).toString().padStart(2, '0')}`,
      })),
      frameRate: 15,
      repeat: -1,
    });

    this.anims.create({
      key: 'p2_run',
      frames: Array.from({ length: 11 }, (_, i) => ({
        key: `p2_walk${(i + 1).toString().padStart(2, '0')}`,
      })),
      frameRate: 15,
      repeat: -1,
    });

    this.anims.create({
      key: 'p3_run',
      frames: Array.from({ length: 11 }, (_, i) => ({
        key: `p3_walk${(i + 1).toString().padStart(2, '0')}`,
      })),
      frameRate: 15,
      repeat: -1,
    });

    this.anims.create({
      key: 'slime_walk',
      frames: [{ key: 'slimeWalk1' }, { key: 'slimeWalk2' }],
      frameRate: 4,
      repeat: -1,
    });

    this.anims.create({
      key: 'fly_hover',
      frames: [{ key: 'flyFly1' }, { key: 'flyFly2' }],
      frameRate: 6,
      repeat: -1,
    });

    // Route to correct scene based on session state
    const sessionState = this.registry.get('sessionState');
    if (sessionState) {
      this.routeToScene(sessionState);
      return;
    }

    this.registry.events.on('changedata-sessionState', (_parent: unknown, value: any) => {
      if (value && this.scene.isActive('BootScene')) {
        this.routeToScene(value);
      }
    });

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
}
