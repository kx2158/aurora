"""
Checks the space drag math (SpaceDrag/DragMath.cs) with an independent model of the same formulas.
Run: python3 drag_math_check.py        (needs only numpy-free standard Python)
The C# was not compiled where this was written; this checks the formulas, not the C# build.
"""
import math, random

def mat_vec(R, v): return [sum(R[i][j] * v[j] for j in range(3)) for i in range(3)]
def mat_t(R): return [[R[j][i] for j in range(3)] for i in range(3)]
def add(a, b): return [x + y for x, y in zip(a, b)]
def sub(a, b): return [x - y for x, y in zip(a, b)]
def scale(a, k): return [x * k for x in a]

def rot_y(a): c, s = math.cos(a), math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]
def rot_x(a): c, s = math.cos(a), math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]
def mm(A, B): return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

# ---- the same formulas as DragMath.cs ----
def offset(t0, h0, h, k, allow_vertical):
    d = sub(h, h0)
    if not allow_vertical: d[1] = 0
    return add(t0, scale(d, k))

def snap(v, step): return round(v / step) * step  # banker's rounding in both Python and .NET Math.Round
def quantize(frm, to, step):
    if step <= 0: return to
    d = sub(to, frm)
    return add(frm, [snap(x, step) for x in d])

def pick_hand(l, r, cur, allowed):
    l = l and allowed in ("left", "both")
    r = r and allowed in ("right", "both")
    if cur == "left" and l: return "left"
    if cur == "right" and r: return "right"
    if l: return "left"
    if r: return "right"
    return None

def standing_of(R, t, raw):  # raw = R*standing + t  ->  standing = R^T (raw - t)
    return mat_vec(mat_t(R), sub(raw, t))

random.seed(5)
fails = 0
def check(name, ok):
    global fails
    if not ok: fails += 1
    print(("PASS " if ok else "FAIL ") + name)

# 1. with k = 1 the hand's standing position never changes during a drag, for any rotation
worst = 0
for _ in range(2000):
    R = mm(rot_y(random.uniform(-3.14, 3.14)), rot_x(random.uniform(-0.3, 0.3)))
    t0 = [random.uniform(-3, 3) for _ in range(3)]
    h0 = [random.uniform(-2, 2) for _ in range(3)]
    s0 = standing_of(R, t0, h0)
    for _ in range(5):
        h = add(h0, [random.uniform(-1.5, 1.5) for _ in range(3)])
        t = offset(t0, h0, h, 1.0, True)
        s = standing_of(R, t, h)
        worst = max(worst, max(abs(a - b) for a, b in zip(s, s0)))
check(f"hand stays still in the world for any rotation (worst error {worst:.2e} m)", worst < 1e-9)

# 2. pulling the hand toward you moves you the other way, by exactly the hand's travel
R = rot_y(0.0); t0 = [0, 0, 0]; h0 = [0, 1.2, -0.5]; head_raw = [0, 1.7, 0]
t = offset(t0, h0, add(h0, [0, 0, 0.4]), 1.0, True)  # hand pulled 0.4 m back (toward +z)
moved = sub(standing_of(R, t, head_raw), standing_of(R, t0, head_raw))
check(f"hand pulled back 0.4 m moves the body forward 0.4 m (got {moved[2]:+.3f})", abs(moved[2] + 0.4) < 1e-9 and abs(moved[0]) < 1e-9 and abs(moved[1]) < 1e-9)

# 3. multiplier scales the travel
t = offset(t0, h0, add(h0, [0.3, 0, 0]), 2.5, True)
check("multiplier 2.5 moves the world 2.5x as far", abs(t[0] - 0.75) < 1e-9)

# 4. vertical lock
t = offset(t0, h0, add(h0, [0.1, 0.5, -0.2]), 1.0, False)
check("vertical off: only the floor plane moves", t[1] == 0 and abs(t[0] - 0.1) < 1e-9 and abs(t[2] + 0.2) < 1e-9)

# 5. comfort mode moves in whole steps and never overshoots by more than half a step
frm = [0, 0, 0]; ok = True
for target in ([0.05, 0, 0], [0.11, 0, 0], [0.31, -0.19, 0.5], [-0.09, 0.01, 0]):
    q = quantize(frm, target, 0.2)
    ok &= all(abs((q[i] - frm[i]) / 0.2 - round((q[i] - frm[i]) / 0.2)) < 1e-9 for i in range(3))  # whole steps
    ok &= all(abs(q[i] - target[i]) <= 0.1 + 1e-9 for i in range(3))
check("comfort mode: whole steps, within half a step of the target", ok)
check("comfort mode: small movement does not move the world at all", quantize([0, 0, 0], [0.09, -0.09, 0.0], 0.2) == [0, 0, 0])

# 6. which hand drives
table = [
    ((True, False, None, "both"), "left"), ((False, True, None, "both"), "right"),
    ((True, True, None, "both"), "left"),       # both at once: left wins when nothing was driving
    ((True, True, "right", "both"), "right"),   # the hand already driving keeps it
    ((False, True, "left", "both"), "right"),   # left let go, right is still held: it takes over
    ((False, False, "right", "both"), None),    # everything released
    ((True, True, None, "right"), "right"),     # right only
    ((True, False, None, "right"), None),       # left held but only right allowed
    ((False, True, "right", "left"), None),
]
check("hand handover table", all(pick_hand(*a) == want for a, want in table))

print("\nall good" if not fails else f"\n{fails} FAILED")
raise SystemExit(1 if fails else 0)
