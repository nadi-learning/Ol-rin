import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.path as mpath
import numpy as np

def draw_filtration():
    fig, ax = plt.subplots(figsize=(6, 8))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 12)
    ax.set_aspect("equal")
    ax.axis("off")

    line_color = "#1a1a1a"
    fill_color = "#eaf2fb"

    # --- Conical Flask ---
    flask_base = [[3.5, 1], [6.5, 1], [5.5, 4], [4.5, 4]]
    flask_poly = patches.Polygon(flask_base, closed=True, fill=False, edgecolor=line_color, lw=1.5)
    ax.add_patch(flask_poly)
    # Liquid in flask
    flask_liquid = [[3.7, 1.2], [6.3, 1.2], [5.8, 2.5], [4.2, 2.5]]
    ax.add_patch(patches.Polygon(flask_liquid, closed=True, color=fill_color, alpha=0.5))

    # --- Funnel ---
    funnel_top = [[3.5, 7], [6.5, 7], [5.1, 5], [4.9, 5]]
    funnel_poly = patches.Polygon(funnel_top, closed=True, fill=False, edgecolor=line_color, lw=1.5)
    ax.add_patch(funnel_poly)
    # Funnel stem
    ax.plot([5.1, 5.1], [5, 3.5], color=line_color, lw=1.5)
    ax.plot([4.9, 4.9], [5, 3.5], color=line_color, lw=1.5)
    
    # Filter paper (v-shape inside funnel)
    ax.plot([3.7, 5, 6.3], [6.8, 5.2, 6.8], color=line_color, lw=1, linestyle="--")

    # --- Beaker (Tilted) ---
    # Center of beaker rotation
    bx, by = 3, 9
    angle = -40
    rad = np.radians(angle)
    c, s = np.cos(rad), np.sin(rad)
    
    def rotate(pts):
        return [[p[0]*c - p[1]*s + bx, p[0]*s + p[1]*c + by] for p in pts]

    beaker_pts = [[-1, -1.5], [1, -1.5], [1, 1.5], [-1, 1.5]]
    beaker_rot = rotate(beaker_pts)
    ax.add_patch(patches.Polygon(beaker_rot, closed=True, fill=False, edgecolor=line_color, lw=1.5))
    
    # Liquid in beaker
    beaker_liq_pts = [[-0.9, -1.4], [0.9, -1.4], [0.9, 0.5], [-0.9, 0.5]]
    beaker_liq_rot = rotate(beaker_liq_pts)
    ax.add_patch(patches.Polygon(beaker_liq_rot, closed=True, color=fill_color, alpha=0.5))

    # --- Pouring Stream ---
    # Stream from beaker spout to funnel
    ax.plot([3.8, 4.8], [8.5, 6.5], color=fill_color, lw=4, alpha=0.7)
    ax.plot([3.8, 4.8], [8.5, 6.5], color=line_color, lw=0.5)

    # --- Drips ---
    ax.add_patch(patches.Circle((5, 3.2), 0.05, color=fill_color, ec=line_color, lw=0.5))
    ax.add_patch(patches.Circle((5, 2.8), 0.05, color=fill_color, ec=line_color, lw=0.5))

    # --- Labels ---
    ax.annotate("clear salt water", xy=(3.5, 9), xytext=(1, 10.5), 
                arrowprops=dict(arrowstyle="->", color=line_color), fontsize=10)
    ax.annotate("filter paper", xy=(4.2, 6.2), xytext=(1, 7.5), 
                arrowprops=dict(arrowstyle="->", color=line_color), fontsize=10)
    ax.annotate("funnel", xy=(6.2, 6.5), xytext=(8, 7), 
                arrowprops=dict(arrowstyle="->", color=line_color), fontsize=10)
    ax.annotate("conical flask", xy=(6.2, 2.5), xytext=(8, 3), 
                arrowprops=dict(arrowstyle="->", color=line_color), fontsize=10)
    ax.annotate("filtrate", xy=(5, 1.8), xytext=(7, 1.5), 
                arrowprops=dict(arrowstyle="->", color=line_color), fontsize=10)

    plt.savefig("out.png", dpi=150)

draw_filtration()