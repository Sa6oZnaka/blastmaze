//import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  preload() {
    
  }

  create() {
    const startText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      'Start Game',
      { fontSize: '32px', fill: '#fff' }
    ).setOrigin(0.5);

    startText.setInteractive();
    startText.on('pointerdown', () => {
      this.scene.start('GameScene');
    });
  }
}
