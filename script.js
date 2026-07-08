document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext('2d');

    let width = 0, height = 0;
    const isPersonal = document.body.classList.contains('theme-personal');

    if (isPersonal) {
        // ──────────────────────────────────────────────────────────────────────
        // PERSONAL PAGE: Original 3D Circuit Animation
        // ──────────────────────────────────────────────────────────────────────
        const COLS = 16;       // columns in the 3D grid
        const ROWS = 27;       // rows
        const MAX_NODE_R = 5;  // maximum node ring radius

        const HORIZON_FRAC = -0.09;
        const NEAR_FRAC = 1.07;
        const MAX_SPREAD = 0.44;

        const EDGE_R = 160, EDGE_G = 20, EDGE_B = 35;

        function hslToRgb(h, s, l) {
            s /= 100;
            l /= 100;
            const k = n => (n + h / 30) % 12;
            const a = s * Math.min(l, 1 - l);
            const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
            return [
                Math.round(255 * f(0)),
                Math.round(255 * f(8)),
                Math.round(255 * f(4))
            ];
        }

        let adjacency = new Map();
        let glowMap = new Map();
        let pulses = [];
        let explosions = [];

        function project(c, r) {
            const t = r / (ROWS - 1);
            const hY = HORIZON_FRAC * height;
            const nY = NEAR_FRAC * height;

            const screenY = hY + t * (nY - hY);
            const cn = (c - (COLS - 1) / 2) / ((COLS - 1) / 2);
            const screenX = width / 2 + cn * (width * MAX_SPREAD) * t;

            const nodeR = Math.max(0.5, MAX_NODE_R * t);
            const fog = Math.min(1, t * 2.2 + 0.08);

            return { x: screenX, y: screenY, t, nodeR, fog };
        }

        function buildGraph() {
            adjacency.clear();
            for (let r = 0; r < ROWS - 1; r++) {
                for (let c = 0; c < COLS; c++) {
                    const nbrs = [{ c, r: r + 1 }];
                    if (c > 0 && Math.random() < 0.28) nbrs.push({ c: c - 1, r: r + 1 });
                    if (c < COLS - 1 && Math.random() < 0.28) nbrs.push({ c: c + 1, r: r + 1 });
                    adjacency.set(`${c},${r}`, nbrs);
                }
            }
        }

        class Pulse {
            static trySpawn() {
                const c = Math.floor(Math.random() * COLS);
                const path = [{ c, r: 0 }];
                let cc = c, cr = 0;

                while (cr < ROWS - 1) {
                    const nbrs = adjacency.get(`${cc},${cr}`) || [];
                    if (nbrs.length === 0) {
                        cr = cr + 1;
                    } else {
                        const nxt = nbrs[Math.floor(Math.random() * nbrs.length)];
                        cc = nxt.c;
                        cr = nxt.r;
                    }
                    path.push({ c: cc, r: cr });
                }

                return new Pulse(path);
            }

            constructor(path) {
                this.path = path;
                this.pts = path.map(pt => project(pt.c, pt.r));

                this.sdist = [0];
                for (let i = 1; i < this.pts.length; i++) {
                    const a = this.pts[i - 1], b = this.pts[i];
                    this.sdist.push(this.sdist[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
                }

                this.totalLen = this.sdist[this.sdist.length - 1];
                this.segLen = this.totalLen / Math.max(1, path.length - 1);

                this.head = 0;
                this.speed = 0.7 + Math.random() * 0.5;
                this.alive = true;
                this.hue = Math.floor(Math.random() * 360);
                const rgb = hslToRgb(this.hue, 100, 50);
                this.r = rgb[0];
                this.g = rgb[1];
                this.b = rgb[2];
                this.thicknessFactor = 1.0;
            }

            update() {
                if (!this.alive) return false;
                this.head += this.speed;

                const tail = this.head - this.segLen;
                if (tail > this.totalLen) {
                    this.alive = false;
                }
                return this.alive;
            }

            at(d) {
                const cd = Math.max(0, Math.min(this.totalLen, d));
                for (let i = 0; i < this.sdist.length - 1; i++) {
                    if (cd >= this.sdist[i] && cd <= this.sdist[i + 1]) {
                        const span = this.sdist[i + 1] - this.sdist[i];
                        const t = span < 0.001 ? 0 : (cd - this.sdist[i]) / span;
                        const a = this.pts[i], b = this.pts[i + 1];
                        return {
                            x: a.x + (b.x - a.x) * t,
                            y: a.y + (b.y - a.y) * t,
                            t: a.t + (b.t - a.t) * t,
                            nodeR: a.nodeR + (b.nodeR - a.nodeR) * t,
                            fog: a.fog + (b.fog - a.fog) * t,
                        };
                    }
                }
                return { ...this.pts[this.pts.length - 1] };
            }

            segPoints() {
                const hd = Math.min(this.totalLen, this.head);
                const td = Math.max(0, this.head - this.segLen);

                const pts = [this.at(td)];
                for (let i = 0; i < this.path.length; i++) {
                    if (this.sdist[i] > td && this.sdist[i] < hd) pts.push(this.pts[i]);
                }
                pts.push(this.at(hd));
                return pts;
            }

            illuminate(map) {
                const hd = Math.min(this.totalLen, this.head);
                const td = Math.max(0, this.head - this.segLen);
                for (let i = 0; i < this.path.length; i++) {
                    if (this.sdist[i] >= td && this.sdist[i] <= hd) {
                        map.set(`${this.path[i].c},${this.path[i].r}`, { r: this.r, g: this.g, b: this.b });
                    }
                }
            }
        }

        class CollisionExplosion {
            constructor(x, y, t, r, g, b) {
                this.x = x;
                this.y = y;
                this.t = t;
                this.r = r;
                this.g = g;
                this.b = b;
                this.radius = 2;
                this.maxRadius = 15 + t * 20;
                this.opacity = 1.0;
                this.particles = [];

                const numSparks = 8 + Math.floor(Math.random() * 6);
                for (let i = 0; i < numSparks; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = (0.8 + Math.random() * 2.2) * (0.8 + t * 1.2);
                    this.particles.push({
                        x: x,
                        y: y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        alpha: 1.0,
                        size: 1 + Math.random() * 1.5
                    });
                }
                this.alive = true;
            }

            update() {
                this.radius += 0.9 * (1 + this.t * 0.8);
                this.opacity -= 0.04;

                for (const p of this.particles) {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.alpha -= 0.04;
                }

                if (this.opacity <= 0) {
                    this.alive = false;
                }
            }

            draw(cContext) {
                cContext.beginPath();
                cContext.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                cContext.strokeStyle = `rgba(${this.r},${this.g},${this.b},${Math.max(0, this.opacity * 0.8)})`;
                cContext.lineWidth = 1 + this.t * 2;
                cContext.shadowColor = `rgb(${this.r},${this.g},${this.b})`;
                cContext.shadowBlur = this.opacity * 10 * this.t;
                cContext.stroke();
                cContext.shadowBlur = 0;

                for (const p of this.particles) {
                    if (p.alpha <= 0) continue;
                    cContext.beginPath();
                    cContext.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    cContext.fillStyle = `rgba(${this.r},${this.g},${this.b},${p.alpha})`;
                    cContext.fill();
                }
            }
        }

        const resizePersonal = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            glowMap.clear();
            buildGraph();
            pulses = [];
            explosions = [];
        };

        const loopPersonal = () => {
            ctx.clearRect(0, 0, width, height);

            // Draw circuit edges
            for (let r = 0; r < ROWS - 1; r++) {
                for (let c = 0; c < COLS; c++) {
                    const nbrs = adjacency.get(`${c},${r}`) || [];
                    const p1 = project(c, r);

                    for (const nb of nbrs) {
                        const p2 = project(nb.c, nb.r);
                        const fog = (p1.fog + p2.fog) / 2;

                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = `rgba(${EDGE_R},${EDGE_G},${EDGE_B},${+(0.06 + fog * 0.13).toFixed(3)})`;
                        ctx.lineWidth = 0.25 + fog * 0.75;
                        ctx.stroke();
                    }
                }
            }

            // Spawn new pulses
            if (pulses.length < 24 && Math.random() < 0.08) {
                const p = Pulse.trySpawn();
                if (p) pulses.push(p);
            }

            // Check for collisions
            for (let i = 0; i < pulses.length; i++) {
                const p1 = pulses[i];
                if (!p1.alive) continue;
                const pos1 = p1.at(p1.head);
                if (pos1.t <= 0.08) continue;

                for (let j = 0; j < pulses.length; j++) {
                    if (i === j) continue;
                    const p2 = pulses[j];
                    if (!p2.alive) continue;

                    const segs2 = p2.segPoints();
                    for (const seg of segs2) {
                        if (seg.t <= 0.08) continue;

                        const dx = pos1.x - seg.x;
                        const dy = pos1.y - seg.y;
                        const dist = Math.hypot(dx, dy);
                        const collisionThreshold = 14 * ((pos1.t + seg.t) / 2);

                        if (dist < collisionThreshold) {
                            p2.alive = false;
                            p1.r = Math.min(255, p1.r + p2.r);
                            p1.g = Math.min(255, p1.g + p2.g);
                            p1.b = Math.min(255, p1.b + p2.b);
                            p1.thicknessFactor = Math.min(3.5, p1.thicknessFactor + 0.6);
                            p1.speed = Math.min(2.5, p1.speed + 0.25);

                            const cx = (pos1.x + seg.x) / 2;
                            const cy = (pos1.y + seg.y) / 2;
                            const ct = (pos1.t + seg.t) / 2;
                            explosions.push(new CollisionExplosion(cx, cy, ct, p1.r, p1.g, p1.b));
                            break;
                        }
                    }
                    if (!p1.alive) break;
                }
            }

            // Update pulses
            pulses = pulses.filter(p => p.update());

            // Update explosions
            explosions = explosions.filter(e => {
                e.update();
                e.draw(ctx);
                return e.alive;
            });

            // Glow tracking
            const active = new Map();
            for (const p of pulses) p.illuminate(active);

            // Draw nodes
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const key = `${c},${r}`;
                    const proj = project(c, r);

                    const target = active.has(key) ? 1 : 0;
                    let glowState = glowMap.get(key) || { intensity: 0, r: 0, g: 0, b: 0 };
                    if (target === 1) {
                        const activeColor = active.get(key);
                        glowState.intensity = Math.min(1.0, glowState.intensity + 0.07);
                        glowState.r = activeColor.r;
                        glowState.g = activeColor.g;
                        glowState.b = activeColor.b;
                    } else {
                        glowState.intensity = Math.max(0.0, glowState.intensity - 0.035);
                    }
                    glowMap.set(key, glowState);

                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, proj.nodeR, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(${EDGE_R},${EDGE_G},${EDGE_B},${+(0.10 + proj.fog * 0.22).toFixed(3)})`;
                    ctx.lineWidth = 0.5 + proj.t * 0.5;
                    ctx.stroke();

                    if (glowState.intensity > 0.01) {
                        ctx.beginPath();
                        ctx.arc(proj.x, proj.y, proj.nodeR, 0, Math.PI * 2);
                        ctx.strokeStyle = `rgba(${glowState.r},${glowState.g},${glowState.b},${+(glowState.intensity * 0.85 * proj.fog).toFixed(3)})`;
                        ctx.shadowColor = `rgb(${glowState.r},${glowState.g},${glowState.b})`;
                        ctx.shadowBlur = glowState.intensity * 12 * proj.t;
                        ctx.lineWidth = 0.7 + glowState.intensity * proj.t * 1.2;
                        ctx.stroke();
                        ctx.shadowBlur = 0;
                    }
                }
            }

            // Draw pulses
            for (const pulse of pulses) {
                const segs = pulse.segPoints();
                if (segs.length < 2) continue;
                const head = segs[segs.length - 1];

                ctx.beginPath();
                ctx.moveTo(segs[0].x, segs[0].y);
                for (let i = 1; i < segs.length; i++) ctx.lineTo(segs[i].x, segs[i].y);

                ctx.strokeStyle = `rgba(${pulse.r},${pulse.g},${pulse.b},${+(0.50 + head.fog * 0.38).toFixed(3)})`;
                ctx.lineWidth = (1.0 + head.t * 2.5) * (pulse.thicknessFactor || 1.0);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowColor = `rgb(${pulse.r},${pulse.g},${pulse.b})`;
                ctx.shadowBlur = 8 * head.t * (pulse.thicknessFactor || 1.0);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            requestAnimationFrame(loopPersonal);
        };

        window.addEventListener('resize', resizePersonal);
        resizePersonal();
        loopPersonal();

    } else {
        // ──────────────────────────────────────────────────────────────────────
        // WORK PAGE: Two-state Ising representation, no g, no empty state
        // ──────────────────────────────────────────────────────────────────────
        //
        // State:
        //     +1 = U vertex / spin up
        //     -1 = V vertex / spin down
        //
        // Fixed-area local weight:
        //
        //     W({s_i}) ∝ exp(H Σ_i s_i) c^(# unlike nearest-neighbor edges)
        //
        // Therefore:
        //
        //     H > 0 favors U
        //     H < 0 favors V
        //     c controls domain-wall cost
        //
        // There is no g here because the lattice area is fixed.
        // In the actual matrix model, g is an area/cosmological fugacity.
        // On a fixed lattice, g^A is a constant and cancels from all spin-flip
        // Metropolis ratios.

        let latticeW = 0, latticeH = 0;
        let State; // Int8Array: +1 for U, -1 for V

        const CELL = 10;
        const GAP = 1;

        const MIN_C = 1e-4;
        const MAX_C = 0.999999;
        const MAX_LOG_ACCEPT = 60;

        const MAX_UPDATES = 350;
        const MIN_UPDATES = 150;
        const STARTUP_UPDATES = 600; // Animation speed during countdown
        const TARGET_JS_MS = 6.0;
        const RAMP_DOWN = 15;
        const RAMP_UP = 8;

        let updatesPerFrame = MAX_UPDATES;

        let isScrolling = false;
        let scrollEndTimer = null;

        window.addEventListener('scroll', () => {
            isScrolling = true;
            clearTimeout(scrollEndTimer);
            scrollEndTimer = setTimeout(() => { isScrolling = false; }, 150);
        }, { passive: true });

        let emaJsMs = 3;

        const adjustSpeed = (jsMs) => {
            emaJsMs = emaJsMs * 0.85 + jsMs * 0.15;

            if (isScrolling) {
                updatesPerFrame = 250; // gentler fallback during scroll
                return;
            }

            if (emaJsMs > TARGET_JS_MS) {
                updatesPerFrame = Math.max(MIN_UPDATES, updatesPerFrame - RAMP_DOWN);
            } else if (emaJsMs < TARGET_JS_MS * 0.5 && updatesPerFrame < MAX_UPDATES) {
                updatesPerFrame = Math.min(MAX_UPDATES, updatesPerFrame + RAMP_UP);
            }
        };

        const params = {
            c: { current: 0.0, target: 0.0 },
            h: { current: 0.0, target: 0.0 }
        };

        let countdownStartTime = Date.now();
        let countdownActive = true;

        let disturbanceEnergy = 0;

        const triggerDisturbance = () => {
            disturbanceEnergy = 1.0;
        };

        const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

        const physicalC = (c) => clamp(c, MIN_C, MAX_C);

        const idxOf = (x, y) => {
            x = (x + latticeW) % latticeW;
            y = (y + latticeH) % latticeH;
            return y * latticeW + x;
        };

        const neighborCounts = (x, y) => {
            let nPlus = 0;
            let nMinus = 0;

            const a = State[idxOf(x - 1, y)];
            const b = State[idxOf(x + 1, y)];
            const c = State[idxOf(x, y - 1)];
            const d = State[idxOf(x, y + 1)];

            if (a === 1) nPlus++; else nMinus++;
            if (b === 1) nPlus++; else nMinus++;
            if (c === 1) nPlus++; else nMinus++;
            if (d === 1) nPlus++; else nMinus++;

            return { nPlus, nMinus };
        };

        const localLogWeight = (spin, x, y, H, logC) => {
            const { nPlus, nMinus } = neighborCounts(x, y);
            const unlike = spin === 1 ? nMinus : nPlus;

            // log W_i(s_i) = H s_i + log(c) * number of unlike neighbors.
            return H * spin + logC * unlike;
        };

        const randomInitialSpin = () => {
            return Math.random() < 0.5 ? 1 : -1;
        };

        const resizeLattice = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;

            const newW = Math.ceil(width / CELL);
            const newH = Math.ceil(height / CELL);

            if (newW !== latticeW || newH !== latticeH) {
                const oldW = latticeW;
                const oldH = latticeH;
                const oldState = State;

                latticeW = newW;
                latticeH = newH;

                const n = latticeW * latticeH;
                State = new Int8Array(n);

                for (let y = 0; y < latticeH; y++) {
                    for (let x = 0; x < latticeW; x++) {
                        const idx = y * latticeW + x;

                        if (oldState && x < oldW && y < oldH) {
                            State[idx] = oldState[y * oldW + x];
                        } else {
                            State[idx] = randomInitialSpin();
                        }
                    }
                }
            }
        };

        const metropolisAttempt = (H, logC) => {
            const n = latticeW * latticeH;
            const idx = (Math.random() * n) | 0;

            const x = idx % latticeW;
            const y = (idx / latticeW) | 0;

            const oldSpin = State[idx];
            const newSpin = -oldSpin;

            const logOld = localLogWeight(oldSpin, x, y, H, logC);
            const logNew = localLogWeight(newSpin, x, y, H, logC);

            const logAccept = logNew - logOld;

            if (logAccept >= 0 || Math.log(Math.random()) < Math.max(-MAX_LOG_ACCEPT, logAccept)) {
                State[idx] = newSpin;
            }
        };

        const simulateStep = () => {
            for (const k in params) {
                params[k].current += (params[k].target - params[k].current) * 0.05;
            }

            const c = physicalC(params.c.current);
            const H = params.h.current;
            const logC = Math.log(c);

            const baseUpdates = countdownActive ? STARTUP_UPDATES : updatesPerFrame;
            const nUpdates = baseUpdates + ((disturbanceEnergy * 600) | 0);
            disturbanceEnergy *= 0.92;

            for (let t = 0; t < nUpdates; t++) {
                metropolisAttempt(H, logC);
            }
        };

        const DIGITS = {
            7: [
                [1, 1, 1, 1, 1],
                [0, 0, 0, 0, 1],
                [0, 0, 0, 1, 0],
                [0, 0, 1, 0, 0],
                [0, 1, 0, 0, 0],
                [0, 1, 0, 0, 0],
                [0, 1, 0, 0, 0]
            ],
            6: [
                [1, 1, 1, 1, 1],
                [1, 0, 0, 0, 0],
                [1, 0, 0, 0, 0],
                [1, 1, 1, 1, 1],
                [1, 0, 0, 0, 1],
                [1, 0, 0, 0, 1],
                [1, 1, 1, 1, 1]
            ],
            5: [
                [1, 1, 1, 1, 1],
                [1, 0, 0, 0, 0],
                [1, 0, 0, 0, 0],
                [1, 1, 1, 1, 1],
                [0, 0, 0, 0, 1],
                [0, 0, 0, 0, 1],
                [1, 1, 1, 1, 1]
            ],
            4: [
                [1, 0, 0, 0, 1],
                [1, 0, 0, 0, 1],
                [1, 0, 0, 0, 1],
                [1, 1, 1, 1, 1],
                [0, 0, 0, 0, 1],
                [0, 0, 0, 0, 1],
                [0, 0, 0, 0, 1]
            ],
            3: [
                [1, 1, 1, 1, 1],
                [0, 0, 0, 0, 1],
                [0, 0, 0, 0, 1],
                [0, 1, 1, 1, 1],
                [0, 0, 0, 0, 1],
                [0, 0, 0, 0, 1],
                [1, 1, 1, 1, 1]
            ],
            2: [
                [1, 1, 1, 1, 1],
                [0, 0, 0, 0, 1],
                [0, 0, 0, 0, 1],
                [1, 1, 1, 1, 1],
                [1, 0, 0, 0, 0],
                [1, 0, 0, 0, 0],
                [1, 1, 1, 1, 1]
            ],
            1: [
                [0, 0, 1, 0, 0],
                [0, 1, 1, 0, 0],
                [0, 0, 1, 0, 0],
                [0, 0, 1, 0, 0],
                [0, 0, 1, 0, 0],
                [0, 0, 1, 0, 0],
                [0, 1, 1, 1, 0]
            ]
        };

        const CELL_DRAW = CELL - GAP;

        const draw = () => {
            ctx.fillStyle = '#050002';
            ctx.fillRect(0, 0, width, height);

            for (let ly = 0; ly < latticeH; ly++) {
                const py = ly * CELL;
                const row = ly * latticeW;

                for (let lx = 0; lx < latticeW; lx++) {
                    const idx = row + lx;
                    const s = State[idx];

                    if (s === 1) {
                        ctx.fillStyle = '#30080e'; // U / spin up
                    } else {
                        ctx.fillStyle = '#003540'; // V / spin down
                    }

                    ctx.fillRect(lx * CELL, py, CELL_DRAW, CELL_DRAW);
                }
            }

            if (countdownActive) {
                const elapsed = (Date.now() - countdownStartTime) / 1000;
                if (elapsed >= 7) {
                    countdownActive = false;
                    params.c.target = 0.6;
                    // Sync controls
                    const sC = document.getElementById('slider-c');
                    const iC = document.getElementById('input-c');
                    if (sC) sC.value = 0.6;
                    if (iC) iC.value = "0.60";
                    triggerDisturbance();
                } else {
                    const currentDigit = 7 - Math.floor(elapsed);
                    const matrix = DIGITS[currentDigit];
                    if (matrix) {
                        const dotR = 8;
                        const spacing = 22;
                        const cols = 5;
                        const rows = 7;
                        const startX = width / 2 - ((cols - 1) * spacing) / 2;
                        const startY = height / 2 - ((rows - 1) * spacing) / 2;

                        ctx.shadowBlur = 20;
                        ctx.shadowColor = '#00f0ff';

                        for (let r = 0; r < rows; r++) {
                            for (let c = 0; c < cols; c++) {
                                const dx = startX + c * spacing;
                                const dy = startY + r * spacing;

                                if (matrix[r][c] === 1) {
                                    ctx.fillStyle = '#00f0ff'; // glowing cyan
                                    ctx.beginPath();
                                    ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
                                    ctx.fill();
                                } else {
                                    ctx.fillStyle = 'rgba(0, 240, 255, 0.1)'; // faint dot-matrix placeholder
                                    ctx.beginPath();
                                    ctx.arc(dx, dy, dotR - 2, 0, Math.PI * 2);
                                    ctx.fill();
                                }
                            }
                        }
                        ctx.shadowBlur = 0;
                    }
                }
            }
        };

        const initControls = () => {
            const physMap = {
                c: { slider: 'slider-c', input: 'input-c' },
                h: { slider: 'slider-h', input: 'input-h' }
            };

            for (const key in physMap) {
                const slider = document.getElementById(physMap[key].slider);
                const numInput = document.getElementById(physMap[key].input);

                if (!slider || !numInput) continue;

                slider.value = params[key].target;
                numInput.value = params[key].target.toFixed(2);

                const sync = (val) => {
                    if (key === 'c') val = physicalC(val);

                    params[key].target = val;
                    slider.value = val;
                    numInput.value = val.toFixed(2);

                    triggerDisturbance();
                };

                slider.addEventListener('input', e => {
                    sync(parseFloat(e.target.value));
                });

                numInput.addEventListener('input', e => {
                    let val = parseFloat(e.target.value);
                    if (isNaN(val)) return;

                    val = Math.max(
                        parseFloat(slider.min),
                        Math.min(parseFloat(slider.max), val)
                    );

                    sync(val);
                });

                numInput.addEventListener('blur', e => {
                    let val = parseFloat(e.target.value);

                    if (isNaN(val)) {
                        val = params[key].target;
                    }

                    val = Math.max(
                        parseFloat(slider.min),
                        Math.min(parseFloat(slider.max), val)
                    );

                    if (key === 'c') val = physicalC(val);

                    numInput.value = val.toFixed(2);
                });
            }

            // Optional: disable the g control if it exists in the HTML.
            // This makes the UI honest: g is not used in a fixed-area binary lattice.
            const gSlider = document.getElementById('slider-g');
            const gInput = document.getElementById('input-g');

            if (gSlider) {
                gSlider.disabled = true;
                gSlider.title = 'g is an area fugacity and is not used in this fixed-area two-state simulation.';
            }

            if (gInput) {
                gInput.disabled = true;
                gInput.title = 'g is an area fugacity and is not used in this fixed-area two-state simulation.';
            }

            const infoBtn = document.getElementById('bg-info-btn');
            const footer = document.querySelector('.theory-footer');

            if (infoBtn && footer) {
                infoBtn.addEventListener('click', () => {
                    footer.scrollIntoView({ behavior: 'smooth' });
                });

                new IntersectionObserver(entries =>
                    entries.forEach(e => {
                        infoBtn.classList.toggle('hidden', e.isIntersecting);
                    }),
                    { threshold: 0.05 }
                ).observe(footer);
            }
        };

        const loopWork = () => {
            const t0 = performance.now();
            simulateStep();
            draw();
            adjustSpeed(performance.now() - t0);
            requestAnimationFrame(loopWork);
        };

        window.addEventListener('resize', resizeLattice);

        initControls();
        resizeLattice();
        loopWork();
    }
});
