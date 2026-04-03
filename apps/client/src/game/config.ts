import Phaser from 'phaser';

export function createGameConfig(
  parent: string | HTMLElement,
  scenes: Phaser.Types.Scenes.SceneType[],
  role: 'student' | 'instructor'
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: window.innerWidth,
    height: role === 'student' ? window.innerHeight : 400,
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 800 },
        debug: false,
      },
    },
    scene: scenes,
    backgroundColor: '#1a1a2e',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };
}
