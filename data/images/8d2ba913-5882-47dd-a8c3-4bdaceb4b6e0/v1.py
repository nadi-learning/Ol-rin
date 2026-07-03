import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
fig, ax = plt.subplots(figsize=(5, 4))
ax.set_aspect("equal")
ax.axis("off")
triangle_pts = np.array([[0, 0], [4, 0], [0, 3]])
poly = patches.Polygon(triangle_pts, closed=True, facecolor="#eaf2fb", edgecolor="#1a1a1a", linewidth=2)
ax.add_patch(poly)
rect = patches.Rectangle((0, 0), 0.3, 0.3, fill=False, edgecolor="#1a1a1a", linewidth=1.5)
ax.add_patch(rect)
ax.text(2, -0.4, "4", ha="center", va="center", fontsize=12)
ax.text(-0.4, 1.5, "3", ha="center", va="center", rotation=90, fontsize=12)
ax.text(2.3, 1.8, "5", ha="center", va="center", rotation=-36.87, fontsize=12)
ax.set_xlim(-0.8, 4.8)
ax.set_ylim(-0.8, 3.8)
plt.savefig("out.png", dpi=150)