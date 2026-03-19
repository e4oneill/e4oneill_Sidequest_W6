// src/entities/PlayerEntity.js

export class PlayerEntity {
  constructor(pkg, assets) {
    this.pkg = pkg;
    this.assets = assets;

    this.tuning = pkg.tuning || {};
    this.tilesCfg = pkg.tiles || {};
    this.bounds = pkg.bounds || {};
    this.levelData = pkg.level || {};

    this.sprite = null;
    this.sensor = null;

    const ps = this.levelData.playerStart || {
      x: this.tilesCfg.frameW ?? 32,
      y: (this.bounds.levelH ?? 0) - (this.tilesCfg.tileH ?? 24) * 4,
    };
    this.startX = ps.x;
    this.startY = ps.y;

    this.maxHealth = Number(this.tuning.player?.maxHealth ?? 3);
    this.health = this.maxHealth;

    this.dead = false;
    this.pendingDeath = false;
    this.deathAnimStarted = false;

    this.invulnTimer = 0;
    this.knockTimer = 0;

    this.attacking = false;
    this.attackFrameCounter = 0;
    this.attackHitThisSwing = false;

    this.MOVE_SPEED = Number(this.tuning.player?.moveSpeed ?? 1.5);
    this.JUMP_STRENGTH = Number(this.tuning.player?.jumpStrength ?? 4.5);

    this.INVULN_FRAMES = Number(this.tuning.player?.invulnFrames ?? 45);
    this.KNOCK_FRAMES = Number(this.tuning.player?.knockFrames ?? 30);

    this.KNOCKBACK_X = Number(this.tuning.player?.knockbackX ?? 2.0);
    this.KNOCKBACK_Y = Number(this.tuning.player?.knockbackY ?? 3.2);

    this.COLLIDER_W = Number(this.tuning.player?.w ?? 18);
    this.COLLIDER_H = Number(this.tuning.player?.h ?? 12);

    this.ANI_OFFSET_Y = Number(this.tuning.player?.aniOffsetY ?? -8);

    this.ATTACK_START = Number(this.tuning.player?.attackStartFrame ?? 4);
    this.ATTACK_END = Number(this.tuning.player?.attackEndFrame ?? 8);
    this.ATTACK_FINISH = Number(this.tuning.player?.attackFinishFrame ?? 12);
  }

  _hasAni(name) {
    return !!(this.sprite?.anis && this.sprite.anis[name]);
  }

  _setAni(name) {
    if (!this._hasAni(name)) return false;
    this.sprite.ani = name;
    return true;
  }

  _setAniFrame(name, frame) {
    if (!this._setAni(name)) return false;
    if (this.sprite.ani) this.sprite.ani.frame = frame;
    return true;
  }

  _playAni(name, startFrame = 0) {
    if (!this._setAni(name)) return false;
    if (this.sprite.ani) {
      this.sprite.ani.frame = startFrame;
      this.sprite.ani.play?.();
    }
    return true;
  }

  buildSprites() {
    const frameW = 128;
    const frameH = 128;

    this.sprite = new Sprite(this.startX, this.startY, frameW, frameH);
    this.sprite.rotationLock = true;

    this.sprite.scale = 0.5;

    this.sprite.anis.w = frameW;
    this.sprite.anis.h = frameH;
    this.sprite.anis.offset.y = -42;

    const idleImg   = this.assets?.playerImg;
    const walkImg   = this.assets?.playerWalkImg;
    const jumpImg   = this.assets?.playerJumpImg;
    const deadImg   = this.assets?.playerDeadImg;
    const attackImg = this.assets?.playerAttackImg;

    // Add each animation by temporarily making its sheet the active one,
    // so p5play bakes the correct image into that animation's frames.
    if (idleImg) {
      this.sprite.spriteSheet = idleImg;
      this.sprite.addAnis({
        idle:     { row: 0, frames: 5, frameDelay: 10 },
        hurtPose: { row: 0, frames: 2, frameDelay: Infinity },
      });
    }
    if (walkImg) {
      this.sprite.spriteSheet = walkImg;
      this.sprite.addAnis({ run: { row: 0, frames: 8, frameDelay: 5 } });
    }
    if (jumpImg) {
      this.sprite.spriteSheet = jumpImg;
      this.sprite.addAnis({ jump: { row: 0, frames: 7, frameDelay: 8 } });
    }
    if (deadImg) {
      this.sprite.spriteSheet = deadImg;
      this.sprite.addAnis({ death: { row: 0, frames: 8, frameDelay: 10 } });
    }
    if (attackImg) {
      this.sprite.spriteSheet = attackImg;
      this.sprite.addAnis({ attack: { row: 0, frames: 4, frameDelay: 3 } });
    }

    // Restore default sheet to idle, then start in idle pose.
    if (idleImg) this.sprite.spriteSheet = idleImg;
    this._setAni("idle");

    this.sprite.w = this.COLLIDER_W;
    this.sprite.h = this.COLLIDER_H;
    this.sprite.friction = 0;
    this.sprite.bounciness = 0;

    this.sensor = new Sprite();
    this.sensor.x = this.sprite.x;
    this.sensor.y = this.sprite.y + this.sprite.h / 2;
    this.sensor.w = this.sprite.w;
    this.sensor.h = 2;
    this.sensor.mass = 0.01;
    this.sensor.removeColliders();
    this.sensor.visible = false;

    const j = new GlueJoint(this.sprite, this.sensor);
    j.visible = false;

    return this;
  }

  reset() {
    this.health = this.maxHealth;
    this.dead = false;
    this.pendingDeath = false;
    this.deathAnimStarted = false;

    this.invulnTimer = 0;
    this.knockTimer = 0;

    this.attacking = false;
    this.attackFrameCounter = 0;
    this.attackHitThisSwing = false;

    if (!this.sprite) return;

    this.sprite.x = this.startX;
    this.sprite.y = this.startY;
    this.sprite.vel.x = 0;
    this.sprite.vel.y = 0;
    this.sprite.tint = "#ffffff";

    if (this.assets?.playerImg) {
      this.sprite.spriteSheet = this.assets.playerImg;
    }

    this._setAni("idle");
  }

  isGrounded(solids) {
    const s = this.sensor;
    if (!s) return false;

    const list = Array.isArray(solids) ? solids : Object.values(solids || {});
    for (const g of list) {
      if (g && s.overlapping(g)) return true;
    }
    return false;
  }

  tickTimers() {
    if (this.invulnTimer > 0) this.invulnTimer--;
    if (this.knockTimer > 0) this.knockTimer--;
  }

  stopX() {
    this.sprite.vel.x = 0;
  }

  moveLeft() {
    this.sprite.vel.x = -this.MOVE_SPEED;
    this.sprite.mirror.x = true;
  }

  moveRight() {
    this.sprite.vel.x = this.MOVE_SPEED;
    this.sprite.mirror.x = false;
  }

  jump() {
    this.sprite.vel.y = -1 * this.JUMP_STRENGTH;
  }

  startAttack() {
    this.attacking = true;
    this.attackHitThisSwing = false;
    this.attackFrameCounter = 0;
    this.stopX();
    this._playAni("attack", 0);
  }

  markAttackHit() {
    this.attackHitThisSwing = true;
  }

  clampToBounds(bounds) {
    const half = (this.sprite?.w ?? 0) / 2;
    const maxX = (bounds?.levelW ?? this.sprite.x) - half;
    this.sprite.x = constrain(this.sprite.x, half, maxX);
  }

  applyAnimation({ grounded, won }) {
    if (!this.sprite?.anis || Object.keys(this.sprite.anis).length === 0)
      return;

    if (this.dead) {
      if (!this.deathAnimStarted) {
        this.deathAnimStarted = true;
        this._playAni("death", 0);
        this.sprite.ani?.noLoop?.();
      } else {
        this._setAni("death");
        const def = this.assets?.playerAnis?.death;
        const frames = Number(def?.frames ?? 1);
        if (this.sprite.ani) this.sprite.ani.frame = Math.max(0, frames - 1);
      }
      return;
    }

    if (won) {
      this._setAni("idle");
      return;
    }

    if (this.knockTimer > 0 || this.pendingDeath) {
      this._setAniFrame("hurtPose", 1);
      return;
    }

    if (this.attacking) return;

    if (!grounded) {
      const f = this.sprite.vel.y < 0 ? 0 : 1;
      this._setAniFrame("jump", f);
      return;
    }

    const moving = Math.abs(this.sprite.vel.x) > 0.01;
    this._setAni(moving ? "run" : "idle");
  }

  takeDamageFromX(sourceX) {
    if (this.invulnTimer > 0 || this.dead) return false;

    this.health = Math.max(0, this.health - 1);
    if (this.health <= 0) this.pendingDeath = true;

    this.invulnTimer = this.INVULN_FRAMES;
    this.knockTimer = this.KNOCK_FRAMES;

    const dir = this.sprite.x < sourceX ? -1 : 1;
    this.sprite.vel.x = dir * this.KNOCKBACK_X;
    this.sprite.vel.y = -this.KNOCKBACK_Y;

    this.attacking = false;
    this.attackFrameCounter = 0;
    this.attackHitThisSwing = false;

    return true;
  }

  applyHurtBlinkTint() {
    if (!this.sprite) return;

    if (!this.dead && this.invulnTimer > 0) {
      this.sprite.tint =
        Math.floor(this.invulnTimer / 4) % 2 === 0 ? "#ff5050" : "#ffffff";
    } else {
      this.sprite.tint = "#ffffff";
    }
  }
}
