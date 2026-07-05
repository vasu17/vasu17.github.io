document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext('2d');

    let width, height;

    // Grid dimensions
    const COLS = 16;       // columns in the 3D grid
    const ROWS = 27;       // rows (enough so row-0 and last row are offscreen)
    const MAX_NODE_R = 5;  // maximum node ring radius (at near/bottom)

    // ── Perspective mapping ───────────────────────────────────────────────────
    // Top of screen = vanishing point (far), bottom = near (viewer side).
    // Row 0 spawns above the screen; row ROWS-1 exits below the screen.
    const HORIZON_FRAC = -0.09;   // horizon Y as fraction of screen height (negative = above screen)
    const NEAR_FRAC    = 1.07;    // near-edge Y as fraction of screen height  (>1 = below screen)
    const MAX_SPREAD   = 0.44;    // max half-width fraction for columns at the near edge

    // Colors
    const EDGE_R = 160, EDGE_G = 20, EDGE_B = 35;
    const CURR_R = 0,   CURR_G = 229, CURR_B = 255;

    let adjacency = new Map();
    let glowMap   = new Map();   // grid key → current glow intensity [0,1]
    let pulses    = [];
    let explosions = [];

    // ── Perspective projection: grid (c, r) → screen ─────────────────────────
    // t = 0 at top/far, t = 1 at bottom/near.
    // Horizontal spread scales linearly with t (correct linear perspective).
    function project(c, r) {
        const t  = r / (ROWS - 1);
        const hY = HORIZON_FRAC * height;
        const nY = NEAR_FRAC    * height;

        const screenY = hY + t * (nY - hY);

        // Columns converge to vanishing point at the top (when t≈0)
        const cn      = (c - (COLS - 1) / 2) / ((COLS - 1) / 2);  // normalized −1 to +1
        const screenX = width / 2 + cn * (width * MAX_SPREAD) * t;

        const nodeR = Math.max(0.5, MAX_NODE_R * t);
        // Atmospheric fog: far objects are dimmer
        const fog   = Math.min(1, t * 2.2 + 0.08);

        return { x: screenX, y: screenY, t, nodeR, fog };
    }

    // ── Graph (downward-only DAG) ─────────────────────────────────────────────
    function buildGraph() {
        adjacency.clear();
        for (let r = 0; r < ROWS - 1; r++) {
            for (let c = 0; c < COLS; c++) {
                const nbrs = [{ c, r: r + 1 }];                                         // straight down
                if (c > 0        && Math.random() < 0.28) nbrs.push({ c: c - 1, r: r + 1 }); // diag-left
                if (c < COLS - 1 && Math.random() < 0.28) nbrs.push({ c: c + 1, r: r + 1 }); // diag-right
                adjacency.set(`${c},${r}`, nbrs);
            }
        }
    }

    // ── Pulse class ───────────────────────────────────────────────────────────
    class Pulse {
        // Spawn a new pulse at a random top column.
        static trySpawn() {
            const c = Math.floor(Math.random() * COLS);
            
            // Build a path strictly from row 0 to ROWS-1
            const path = [{ c, r: 0 }];
            let cc = c, cr = 0;

            while (cr < ROWS - 1) {
                const nbrs = adjacency.get(`${cc},${cr}`) || [];
                if (nbrs.length === 0) {
                    cc = cc;
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

            // Pre-project every node to screen coords once at spawn time.
            this.pts = path.map(pt => project(pt.c, pt.r));

            // Cumulative screen-space distances along the path.
            this.sdist = [0];
            for (let i = 1; i < this.pts.length; i++) {
                const a = this.pts[i - 1], b = this.pts[i];
                this.sdist.push(this.sdist[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
            }

            this.totalLen = this.sdist[this.sdist.length - 1];
            // Segment length ≈ one step in screen-space (average step distance)
            this.segLen = this.totalLen / Math.max(1, path.length - 1);

            this.head  = 0;                          // head position along path (screen px)
            this.speed = 0.7 + Math.random() * 0.5; // px per frame
            this.alive = true;
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

        // Interpolate a screen-space point at cumulative distance d.
        at(d) {
            const cd = Math.max(0, Math.min(this.totalLen, d));
            for (let i = 0; i < this.sdist.length - 1; i++) {
                if (cd >= this.sdist[i] && cd <= this.sdist[i + 1]) {
                    const span = this.sdist[i + 1] - this.sdist[i];
                    const t    = span < 0.001 ? 0 : (cd - this.sdist[i]) / span;
                    const a = this.pts[i], b = this.pts[i + 1];
                    return {
                        x:    a.x     + (b.x     - a.x)     * t,
                        y:    a.y     + (b.y     - a.y)     * t,
                        t:    a.t     + (b.t     - a.t)     * t,
                        nodeR:a.nodeR + (b.nodeR  - a.nodeR) * t,
                        fog:  a.fog   + (b.fog   - a.fog)   * t,
                    };
                }
            }
            return { ...this.pts[this.pts.length - 1] };
        }

        // Returns screen points between tail and head (including corner nodes).
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

        // Mark path nodes currently between tail and head as illuminated.
        illuminate(map) {
            const hd = Math.min(this.totalLen, this.head);
            const td = Math.max(0, this.head - this.segLen);
            for (let i = 0; i < this.path.length; i++) {
                if (this.sdist[i] >= td && this.sdist[i] <= hd) {
                    map.set(`${this.path[i].c},${this.path[i].r}`, true);
                }
            }
        }
    }

    // ── Explosion class for colliding currents ────────────────────────────────
    class CollisionExplosion {
        constructor(x, y, t) {
            this.x = x;
            this.y = y;
            this.t = t;
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
            // Draw expanding cyan ring
            cContext.beginPath();
            cContext.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            cContext.strokeStyle = `rgba(${CURR_R},${CURR_G},${CURR_B},${Math.max(0, this.opacity * 0.8)})`;
            cContext.lineWidth = 1 + this.t * 2;
            cContext.shadowColor = `rgb(${CURR_R},${CURR_G},${CURR_B})`;
            cContext.shadowBlur = this.opacity * 10 * this.t;
            cContext.stroke();
            cContext.shadowBlur = 0;

            // Draw sparks
            for (const p of this.particles) {
                if (p.alpha <= 0) continue;
                cContext.beginPath();
                cContext.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                cContext.fillStyle = `rgba(${CURR_R},${CURR_G},${CURR_B},${p.alpha})`;
                cContext.fill();
            }
        }
    }

    // ── Initialise / resize ───────────────────────────────────────────────────
    function init() {
        width  = canvas.width  = window.innerWidth;
        height = canvas.height = window.innerHeight;
        glowMap.clear();
        buildGraph();
        pulses = [];
        explosions = [];
    }

    window.addEventListener('resize', init);
    init();

    // ── Animation loop ────────────────────────────────────────────────────────
    function animate() {
        ctx.clearRect(0, 0, width, height);

        // 1 — Draw circuit edges (far → near so near edges sit on top).
        for (let r = 0; r < ROWS - 1; r++) {
            for (let c = 0; c < COLS; c++) {
                const nbrs = adjacency.get(`${c},${r}`) || [];
                const p1   = project(c, r);

                for (const nb of nbrs) {
                    const p2  = project(nb.c, nb.r);
                    const fog = (p1.fog + p2.fog) / 2;

                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = `rgba(${EDGE_R},${EDGE_G},${EDGE_B},${+(0.06 + fog * 0.13).toFixed(3)})`;
                    ctx.lineWidth   = 0.25 + fog * 0.75;
                    ctx.stroke();
                }
            }
        }

        // 2 — Spawn new pulses.
        if (pulses.length < 24 && Math.random() < 0.08) {
            const p = Pulse.trySpawn();
            if (p) pulses.push(p);
        }

        // 3 — Check for collisions (only on screen: t > 0.08)
        for (let i = 0; i < pulses.length; i++) {
            const p1 = pulses[i];
            if (!p1.alive) continue;
            const pos1 = p1.at(p1.head);
            if (pos1.t <= 0.08) continue; // ignore horizon/vanishing point convergence

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
                        p1.alive = false;
                        p2.alive = false;
                        
                        // Explosion at collision spot
                        const cx = (pos1.x + seg.x) / 2;
                        const cy = (pos1.y + seg.y) / 2;
                        const ct = (pos1.t + seg.t) / 2;
                        explosions.push(new CollisionExplosion(cx, cy, ct));
                        break; // exit segment loop
                    }
                }
                if (!p1.alive) break; // exit outer loop for this pulse
            }
        }

        // 4 — Update existing pulses.
        pulses = pulses.filter(p => p.update());

        // 5 — Update and draw explosions.
        explosions = explosions.filter(e => {
            e.update();
            e.draw(ctx);
            return e.alive;
        });

        // 6 — Collect which nodes should be glowing right now.
        const active = new Map();
        for (const p of pulses) p.illuminate(active);

        // 7 — Draw nodes (far → near).
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const key  = `${c},${r}`;
                const proj = project(c, r);

                // Smooth glow intensity transition.
                const target = active.has(key) ? 1 : 0;
                let   glow   = glowMap.get(key) || 0;
                if      (glow < target) glow = Math.min(target, glow + 0.07);
                else if (glow > target) glow = Math.max(target, glow - 0.035);
                glowMap.set(key, glow);

                // Base dim-red ring — scales in size and opacity with perspective depth.
                ctx.beginPath();
                ctx.arc(proj.x, proj.y, proj.nodeR, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(${EDGE_R},${EDGE_G},${EDGE_B},${+(0.10 + proj.fog * 0.22).toFixed(3)})`;
                ctx.lineWidth   = 0.5 + proj.t * 0.5;
                ctx.stroke();

                // Cyan glow ring — fades in/out with glow intensity.
                if (glow > 0.01) {
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, proj.nodeR, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(${CURR_R},${CURR_G},${CURR_B},${+(glow * 0.85 * proj.fog).toFixed(3)})`;
                    ctx.shadowColor = `rgb(${CURR_R},${CURR_G},${CURR_B})`;
                    ctx.shadowBlur  = glow * 12 * proj.t;
                    ctx.lineWidth   = 0.7 + glow * proj.t * 1.2;
                    ctx.stroke();
                    ctx.shadowBlur  = 0;
                }
            }
        }

        // 8 — Draw pulse segments on top of everything.
        for (const pulse of pulses) {
            const segs = pulse.segPoints();
            if (segs.length < 2) continue;

            const head = segs[segs.length - 1]; // perspective values at the head

            ctx.beginPath();
            ctx.moveTo(segs[0].x, segs[0].y);
            for (let i = 1; i < segs.length; i++) ctx.lineTo(segs[i].x, segs[i].y);

            // Thicker and more opaque when closer to the viewer.
            ctx.strokeStyle = `rgba(${CURR_R},${CURR_G},${CURR_B},${+(0.50 + head.fog * 0.38).toFixed(3)})`;
            ctx.lineWidth   = 1.0 + head.t * 2.5;
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'round';
            ctx.shadowColor = `rgb(${CURR_R},${CURR_G},${CURR_B})`;
            ctx.shadowBlur  = 8 * head.t;
            ctx.stroke();
            ctx.shadowBlur  = 0;
        }

        requestAnimationFrame(animate);
    }

    animate();
});
