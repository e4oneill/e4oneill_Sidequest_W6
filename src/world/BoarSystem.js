// src/world/BoarSystem.js
// Boar AI + probes (WORLD helper).
//
// Responsibilities:
// - Create boar Group configuration (tile='b', anis wiring)
// - Initialize boars spawned by Tiles() (one-time _lvlInit)
// - Maintain probes (front/foot/ground)
// - Implement patrol/turn/knock/death behaviors
// - Provide restart helpers (clear + rebuild from cached spawns)
//
// Non-goals:
// - Does NOT handle player input or HUD
// - Does NOT load assets (AssetLoader does)

export function buildBoarGroup(level) {
  const tiles = level.levelData?.tiles ?? level.tilesCfg ?? {};
  const frameW = Number(tiles.frameW) || 32;
  const frameH = Number(tiles.frameH) || 32;

  level.boar = new Group();
  level.boar.physics = "dynamic";
  level.boar.tile = "b";

  // IMPORTANT:
  // Some p5play builds treat anis.w / anis.h as getter-only.
  // So we NEVER assume those assignments are safe.
  if (level.assets) {
    setupWerewolfAnis(level.boar, level.assets);
  }
}

function ensureBoarAnis(level, e) {
  const hasDeath = !!(e.anis && e.anis.death);
  const hasThrow = !!(e.anis && e.anis.throwPose);
  const hasRun   = !!(e.anis && e.anis.run);
  if (hasDeath && hasThrow && hasRun) return;

  if (level.assets) setupWerewolfAnis(e, level.assets);
}

// ---------------------------------------------------------------------------
// p5play v3 compatibility helpers
// ---------------------------------------------------------------------------

// Read size without assuming w/h are writable.
function boarWidth(e, fallbackW) {
  const v = e?.width ?? e?.w ?? fallbackW;
  return Number(v) || Number(fallbackW) || 18;
}

function boarHeight(e, fallbackH) {
  const v = e?.height ?? e?.h ?? fallbackH;
  return Number(v) || Number(fallbackH) || 12;
}

// Tiles() may spawn boars at tile-sized colliders.
// Some builds crash if you try to assign e.w/e.h.
// Instead: if size looks wrong, REPLACE the sprite using new Sprite(x,y,w,h).
function needsColliderReplace(e, desiredW, desiredH) {
  const w = boarWidth(e, desiredW);
  const h = boarHeight(e, desiredH);
  // Tiny tolerance
  return Math.abs(w - desiredW) > 0.25 || Math.abs(h - desiredH) > 0.25;
}

// Copy minimal state from a Tiles()-spawned boar into a correctly-sized sprite.
function replaceBoarSprite(level, oldBoar, desiredW, desiredH) {
  const s = new Sprite(oldBoar.x, oldBoar.y, desiredW, desiredH);

  // Preserve direction if present
  s.dir = oldBoar.dir;

  // Preserve any per-sprite fields Tiles() might have set
  // (and anything Level/TileBuilder might have attached)
  // We only copy what we rely on.
  s._lvlInit = false;

  // Remove the old sprite from the world + group safely
  oldBoar.footProbe?.remove?.();
  oldBoar.frontProbe?.remove?.();
  oldBoar.groundProbe?.remove?.();
  oldBoar.remove?.();

  // Add new sprite to the boar group
  level.boar.add(s);

  return s;
}

// ---------------------------------------------------------------------------
// Werewolf animation setup — wires each animation to its own sprite sheet
// ---------------------------------------------------------------------------

function setupWerewolfAnis(e, assets) {
  if (!e) return;
  try { e.scale = 0.38; } catch (_) {}
  safeConfigureAniSheet(e, 128, 128, -45);

  if (assets.boarWalkImg) {
    safeAssignSpriteSheet(e, assets.boarWalkImg);
    try { e.addAnis({ run: { row: 0, frames: 11, frameDelay: 5 } }); } catch (_) {}
  }
  if (assets.boarImg) {
    safeAssignSpriteSheet(e, assets.boarImg);
    try { e.addAnis({ throwPose: { row: 0, frames: 1, frameDelay: Infinity } }); } catch (_) {}
  }
  if (assets.boarAttackImg) {
    safeAssignSpriteSheet(e, assets.boarAttackImg);
    try { e.addAnis({ attack: { row: 0, frames: 4, frameDelay: 4 } }); } catch (_) {}
  }
  if (assets.boarDeadImg) {
    safeAssignSpriteSheet(e, assets.boarDeadImg);
    try { e.addAnis({ death: { row: 0, frames: 2, frameDelay: 10 } }); } catch (_) {}
  }
  // Restore default sheet to walk
  safeAssignSpriteSheet(e, assets.boarWalkImg ?? assets.boarImg);
}

function safeAssignSpriteSheet(target, img) {
  if (!img || !target) return;
  try {
    target.spriteSheet = img;
  } catch (err) {
    // ignore
  }
}

function safeConfigureAniSheet(target, frameW, frameH, offsetY) {
  if (!target) return;
  try {
    if (!target.anis) return;
    // These setters can throw in some builds; wrap each.
    try {
      target.anis.w = frameW;
    } catch (e) {}
    try {
      target.anis.h = frameH;
    } catch (e) {}
    try {
      if (target.anis.offset) target.anis.offset.y = offsetY;
    } catch (e) {}
  } catch (err) {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Public helpers used by Level
// ---------------------------------------------------------------------------

export function hookBoarSolids(level) {
  if (!level.boar) return;
  if (level.ground) level.boar.collides(level.ground);
  if (level.groundDeep) level.boar.collides(level.groundDeep);
  if (level.platformsL) level.boar.collides(level.platformsL);
  if (level.platformsR) level.boar.collides(level.platformsR);
  if (level.wallsL) level.boar.collides(level.wallsL);
  if (level.wallsR) level.boar.collides(level.wallsR);
}

export function cacheBoarSpawns(level) {
  level.boarSpawns = [];
  if (!level.boar) return;
  for (const e of level.boar) {
    level.boarSpawns.push({ x: e.x, y: e.y, dir: e.dir });
  }
}

export function clearBoars(level) {
  if (!level.boar) return;
  for (const e of level.boar) {
    e.footProbe?.remove?.();
    e.frontProbe?.remove?.();
    e.groundProbe?.remove?.();
    e.remove?.();
  }
}

export function rebuildBoarsFromSpawns(level) {
  // Recreate the group itself
  buildBoarGroup(level);

  const tiles = level.levelData?.tiles ?? level.tilesCfg ?? {};
  const frameW = Number(tiles.frameW) || 32;
  const frameH = Number(tiles.frameH) || 32;

  const boarW = Number(level.tuning.boar?.w ?? 18);
  const boarH = Number(level.tuning.boar?.h ?? 12);
  const boarHP = Number(level.tuning.boar?.hp ?? 3);

  for (const s of level.boarSpawns) {
    // Create with desired collider size (most reliable across builds)
    const e = new Sprite(s.x, s.y, boarW, boarH);

    setupWerewolfAnis(e, level.assets);

    // Init like Tiles() boars
    e.rotationLock = true;
    e.physics = "dynamic";
    e.friction = 0;
    e.bounciness = 0;
    e.hp = boarHP;

    attachBoarProbes(level, e);

    e.dir = s.dir === 1 || s.dir === -1 ? s.dir : random([-1, 1]);
    fixSpawnEdgeCase(level, e);

    e.wasDanger = false;
    e.flashTimer = 0;
    e.knockTimer = 0;
    e.turnTimer = 0;

    e.dead = false;
    e.dying = false;
    e.deathStarted = false;
    e.deathFrameTimer = 0;

    e.vanishTimer = 0;
    e.holdX = e.x;
    e.holdY = e.y;

    e.mirror.x = e.dir === -1;

    level._setAniSafe?.(e, "run");
    level.boar.add(e);
  }
}

// ---------------------------------------------------------------------------
// Boar AI update
// ---------------------------------------------------------------------------

export function updateBoars(level) {
  if (!level.boar) return;

  if (level.won) {
    for (const e of level.boar) e.vel.x = 0;
    return;
  }

  const tiles = level.levelData?.tiles ?? level.tilesCfg ?? {};
  const frameW = Number(tiles.frameW) || 32;
  const frameH = Number(tiles.frameH) || 32;

  const boarSpeed = Number(level.tuning.boar?.speed ?? 0.6);
  const boarW = Number(level.tuning.boar?.w ?? 18);
  const boarH = Number(level.tuning.boar?.h ?? 12);
  const boarHP = Number(level.tuning.boar?.hp ?? 3);

  const hasAnis = level.assets?.boarAnis && typeof level.assets.boarAnis === "object";

  // IMPORTANT:
  // We iterate over a snapshot so replacing/removing boars won't break the loop.
  const boarsSnapshot = [...level.boar];

  for (const old of boarsSnapshot) {
    let e = old;

    // -----------------------------
    // One-time init for Tiles() boars
    // -----------------------------
    if (e._lvlInit !== true) {
      // If this sprite's collider is tile-sized, replace it safely.
      if (needsColliderReplace(e, boarW, boarH)) {
        e = replaceBoarSprite(level, e, boarW, boarH);
      }

      e._lvlInit = true;

      e.physics = "dynamic";
      e.rotationLock = true;

      e.friction = 0;
      e.bounciness = 0;

      e.hp = e.hp ?? boarHP;

      setupWerewolfAnis(e, level.assets);
      ensureBoarAnis(level, e);

      attachBoarProbes(level, e);

      e.dir = e.dir === 1 || e.dir === -1 ? e.dir : random([-1, 1]);
      fixSpawnEdgeCase(level, e);

      e.wasDanger = false;

      e.flashTimer = 0;
      e.knockTimer = 0;
      e.turnTimer = 0;

      e.dead = false;
      e.dying = false;
      e.deathStarted = false;
      e.deathFrameTimer = 0;

      e.vanishTimer = 0;
      e.holdX = e.x;
      e.holdY = e.y;

      e.mirror.x = e.dir === -1;

      // start in run pose
      level._setAniSafe?.(e, "run");
    }

    // -----------------------------
    // Probes + timers
    // -----------------------------
    updateBoarProbes(level, e);
    updateGroundProbe(level, e, boarH);

    if (e.flashTimer > 0) e.flashTimer--;
    if (e.knockTimer > 0) e.knockTimer--;
    if (e.turnTimer > 0) e.turnTimer--;

    e.tint = e.flashTimer > 0 ? "#ff5050" : "#ffffff";

    const grounded = boarGrounded(level, e);

    // -----------------------------
    // Death state machine (monolith-matching)
    // -----------------------------
    if (!e.dead && e.dying && grounded) {
      e.dead = true;
      e.deathStarted = false;
    }

    if (e.dying && !e.dead) {
      e.vel.x = 0;
      level._setAniFrame0Safe?.(e, "throwPose");
      continue;
    }

    if (e.dead && !e.deathStarted) {
      e.deathStarted = true;

      e.holdX = e.x;
      e.holdY = e.y;

      e.vel.x = 0;
      e.vel.y = 0;

      e.collider = "none";
      e.removeColliders();

      e.x = e.holdX;
      e.y = e.holdY;

      level._setAniFrame0Safe?.(e, "death");

      e.deathFrameTimer = 0;
      e.vanishTimer = 24;
      e.visible = true;
    }

    if (e.dead) {
      e.x = e.holdX;
      e.y = e.holdY;

      const deathDef = level.assets?.boarAnis?.death;
      const frames = Number(deathDef?.frames ?? 1);
      const delayFrames = Number(deathDef?.frameDelay ?? 6);
      const msPerFrame = (delayFrames * 1000) / 60;

      e.deathFrameTimer += deltaTime;
      const f = Math.floor(e.deathFrameTimer / msPerFrame);

      if (e.ani) e.ani.frame = Math.min(frames - 1, f);

      if (f >= frames - 1) {
        if (e.vanishTimer > 0) {
          e.visible = Math.floor(e.vanishTimer / 3) % 2 === 0;
          e.vanishTimer--;
        } else {
          e.footProbe?.remove?.();
          e.frontProbe?.remove?.();
          e.groundProbe?.remove?.();
          e.remove?.();
        }
      }
      continue;
    }

    // -----------------------------
    // Control states
    // -----------------------------
    if (e.knockTimer > 0) {
      level._setAniFrame0Safe?.(e, "throwPose");
      continue;
    }

    if (!grounded) {
      level._setAniFrame0Safe?.(e, "throwPose");
      continue;
    }

    if (e.dir !== 1 && e.dir !== -1) e.dir = random([-1, 1]);

    const halfW = boarWidth(e, boarW) / 2;

    if (e.x < halfW) turnBoar(level, e, 1);
    if (e.x > level.bounds.levelW - halfW) turnBoar(level, e, -1);

    const noGroundAhead = !frontProbeHasGroundAhead(level, e);
    const frontHitsLeaf = e.frontProbe.overlapping(level.leaf);
    const frontHitsFire = e.frontProbe.overlapping(level.fire);
    const frontHitsWall = frontProbeHitsWall(level, e);
    const headSeesFire = e.footProbe.overlapping(level.fire);

    const dangerNow = noGroundAhead || frontHitsLeaf || frontHitsFire || frontHitsWall || headSeesFire;

    if (e.turnTimer === 0 && shouldTurnNow(e, dangerNow)) {
      turnBoar(level, e, -e.dir);
      updateBoarProbes(level, e);
      continue;
    }

    // patrol
    e.vel.x = e.dir * boarSpeed;
    e.mirror.x = e.dir === -1;

    // Extra safety: don't let "run" override terminal states
    if (!e.dead && !e.dying) level._setAniSafe?.(e, "run");
  }
}

// -----------------------
// probes + movement helpers
// -----------------------

function placeProbe(probe, x, y) {
  probe.x = x;
  probe.y = y;
}

export function attachBoarProbes(level, e) {
  const size = Number(level.tuning.boar?.probeSize ?? 4);

  // Helper: sensor sprite that still has a collider
  const makeProbe = () => {
    const p = new Sprite(-9999, -9999, size, size);

    // IMPORTANT:
    // sensor=true means "detect overlaps but don't push"
    // collider must NOT be "none" or overlaps often won't work
    p.sensor = true;
    p.collider = "dynamic"; // keep a collider so overlapping() works
    p.mass = 0.0001; // effectively weightless
    p.rotationLock = true;

    p.visible = false;
    p.layer = 999;

    // reduce physics side effects
    p.friction = 0;
    p.bounciness = 0;

    return p;
  };

  e.footProbe = makeProbe();
  e.frontProbe = makeProbe();
  e.groundProbe = makeProbe();
}

function updateBoarProbes(level, e) {
  const forward = level.tuning.boar?.probeForward ?? 10;
  const frontY = level.tuning.boar?.probeFrontY ?? 10;
  const headY = level.tuning.boar?.probeHeadY ?? 0;

  const forwardX = e.x + e.dir * forward;
  placeProbe(e.frontProbe, forwardX, e.y + frontY);
  placeProbe(e.footProbe, forwardX, e.y - headY);
}

function updateGroundProbe(level, e, fallbackH) {
  const h = boarHeight(e, Number(fallbackH ?? level.tuning.boar?.h ?? 12));
  placeProbe(e.groundProbe, e.x, e.y + h / 2 + 4);
}

function frontProbeHasGroundAhead(level, e) {
  const p = e.frontProbe;
  return (
    p.overlapping(level.ground) ||
    p.overlapping(level.groundDeep) ||
    p.overlapping(level.platformsL) ||
    p.overlapping(level.platformsR)
  );
}

function frontProbeHitsWall(level, e) {
  const p = e.frontProbe;
  return p.overlapping(level.wallsL) || p.overlapping(level.wallsR);
}

function boarGrounded(level, e) {
  const p = e.groundProbe;
  return (
    p.overlapping(level.ground) ||
    p.overlapping(level.groundDeep) ||
    p.overlapping(level.platformsL) ||
    p.overlapping(level.platformsR)
  );
}

function shouldTurnNow(e, dangerNow) {
  const risingEdge = dangerNow && !e.wasDanger;
  e.wasDanger = dangerNow;
  return risingEdge;
}

function turnBoar(level, e, newDir) {
  const cooldown = level.tuning.boar?.turnCooldown ?? 12;
  if (e.turnTimer > 0) return;

  e.dir = newDir;
  e.turnTimer = cooldown;
  e.x += e.dir * 6;
  e.vel.x = 0;
}

function groundAheadForDir(level, e, dir) {
  const old = e.dir;
  e.dir = dir;
  updateBoarProbes(level, e);

  const ok =
    e.frontProbe.overlapping(level.ground) ||
    e.frontProbe.overlapping(level.groundDeep) ||
    e.frontProbe.overlapping(level.platformsL) ||
    e.frontProbe.overlapping(level.platformsR);

  e.dir = old;
  return ok;
}

function fixSpawnEdgeCase(level, e) {
  const leftOk = groundAheadForDir(level, e, -1);
  const rightOk = groundAheadForDir(level, e, 1);

  if (leftOk && !rightOk) e.dir = -1;
  else if (rightOk && !leftOk) e.dir = 1;

  updateBoarProbes(level, e);
  e.vel.x = 0;
  e.turnTimer = 0;
  e.wasDanger = false;
}
