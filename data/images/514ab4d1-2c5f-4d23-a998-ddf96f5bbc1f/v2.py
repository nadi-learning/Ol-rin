import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
fig, ax = plt.subplots(figsize=(6, 4))
ax.set_xlim(0, 10)
ax.set_ylim(0, 8)
ax.set_aspect("equal")
ax.axis("off")
ax.add_patch(patches.Rectangle((1.5, 1.5), 2.5, 3.5, facecolor="#eaf2fb", edgecolor="none", zorder=1))
ax.plot([1.5, 1.5, 4.0, 4.0], [6.0, 1.5, 1.5, 6.0], color="#1a1a1a", lw=2, zorder=5)
ax.plot([1.5, 4.0], [5.0, 5.0], color="#1a1a1a", lw=1.5, zorder=5)
ax.text(2.75, 6.5, "A", ha="center", fontsize=16, fontweight="bold", zorder=6)
ax.add_patch(patches.Rectangle((6.0, 1.5), 2.5, 3.5, facecolor="#eaf2fb", edgecolor="none", zorder=1))
ax.plot([6.0, 6.0, 8.5, 8.5], [6.0, 1.5, 1.5, 6.0], color="#1a1a1a", lw=2, zorder=5)
ax.plot([6.0, 8.5], [5.0, 5.0], color="#1a1a1a", lw=1.5, zorder=5)
ax.text(7.25, 6.5, "B", ha="center", fontsize=16, fontweight="bold", zorder=6)
sand_path = [[6.05, 1.5], [6.4, 1.9], [6.8, 2.2], [7.2, 1.8], [7.6, 2.0], [8.0, 2.3], [8.45, 1.5]]
ax.add_patch(patches.Polygon(sand_path, facecolor="#d2b48c", edgecolor="#8b4513", lw=0.5, zorder=3))
np.random.seed(42)
ax.scatter(np.random.uniform(6.1, 8.4, 100), np.random.uniform(1.51, 1.8, 100), s=2, color="#8b4513", zorder=4, alpha=0.7)
plt.savefig("out.png", dpi=150)