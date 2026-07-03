import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np

def draw_diagram():
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.set_aspect('equal')
    ax.axis('off')

    # Colors
    line_color = '#1a1a1a'
    fill_color = '#f0f0f0'
    flame_outer = '#add8e6'
    flame_inner = '#0000ff'
    salt_color = '#ffffff'

    # --- Bunsen Burner ---
    # Base
    base = patches.Rectangle((4, 0.5), 2, 0.3, facecolor=fill_color, edgecolor=line_color, linewidth=1.5)
    ax.add_patch(base)
    # Barrel
    barrel = patches.Rectangle((4.75, 0.8), 0.5, 2.5, facecolor=fill_color, edgecolor=line_color, linewidth=1.5)
    ax.add_patch(barrel)
    # Air hole (open for roaring flame)
    air_hole = patches.Circle((5, 1.1), 0.1, color=line_color)
    ax.add_patch(air_hole)

    # --- Roaring Flame ---
    # Outer flame
    outer_flame_pts = [[4.6, 3.3], [5, 5.5], [5.4, 3.3]]
    outer_flame = patches.Polygon(outer_flame_pts, closed=True, facecolor=flame_outer, alpha=0.6, edgecolor=None)
    ax.add_patch(outer_flame)
    # Inner flame
    inner_flame_pts = [[4.8, 3.3], [5, 4.5], [5.2, 3.3]]
    inner_flame = patches.Polygon(inner_flame_pts, closed=True, facecolor=flame_inner, alpha=0.8, edgecolor=None)
    ax.add_patch(inner_flame)

    # --- Tripod ---
    # Legs
    ax.plot([3.5, 4.2], [0.5, 5.5], color=line_color, linewidth=2)
    ax.plot([6.5, 5.8], [0.5, 5.5], color=line_color, linewidth=2)
    # Top ring / Gauze
    ax.plot([3.8, 6.2], [5.5, 5.5], color=line_color, linewidth=3) # Wire gauze

    # --- Evaporating Dish ---
    # Dish body (semi-circle)
    theta = np.linspace(np.pi, 2*np.pi, 100)
    dish_x = 5 + 1.2 * np.cos(theta)
    dish_y = 6.5 + 1.0 * np.sin(theta)
    ax.plot(dish_x, dish_y, color=line_color, linewidth=1.5)
    ax.plot([3.8, 6.2], [6.5, 6.5], color=line_color, linewidth=1.5)
    
    # --- Contents ---
    # Tiny amount of liquid
    liquid_theta = np.linspace(1.3*np.pi, 1.7*np.pi, 50)
    liq_x = 5 + 0.8 * np.cos(liquid_theta)
    liq_y = 6.5 + 0.9 * np.sin(liquid_theta)
    ax.fill_between(liq_x, liq_y, 5.6, color='#eaf2fb')

    # Crusty salt forming on edges
    salt_patches = [
        patches.Ellipse((4.2, 6.2), 0.4, 0.2, angle=30, facecolor=salt_color, edgecolor=line_color, linewidth=0.5),
        patches.Ellipse((5.8, 6.2), 0.4, 0.2, angle=-30, facecolor=salt_color, edgecolor=line_color, linewidth=0.5),
        patches.Ellipse((5.0, 5.6), 0.3, 0.15, facecolor=salt_color, edgecolor=line_color, linewidth=0.5),
        patches.Ellipse((4.5, 5.8), 0.25, 0.1, angle=10, facecolor=salt_color, edgecolor=line_color, linewidth=0.5)
    ]
    for p in salt_patches:
        ax.add_patch(p)

    # --- Vigorous Steam ---
    def draw_steam(x_start, y_start):
        ts = np.linspace(0, 1.5, 20)
        xs = x_start + 0.1 * np.sin(2 * np.pi * ts)
        ys = y_start + ts
        ax.plot(xs, ys, color='#cccccc', linewidth=1.5, alpha=0.7)

    draw_steam(4.5, 6.7)
    draw_steam(5.0, 6.8)
    draw_steam(5.5, 6.7)
    draw_steam(4.2, 6.6)
    draw_steam(5.8, 6.6)

    # Labels
    ax.text(5, 7.5, "Steam", ha='center', fontsize=10)
    ax.text(6.5, 6.0, "Salt crust", ha='left', fontsize=10)
    ax.annotate('', xy=(6.0, 6.0), xytext=(6.5, 6.0), arrowprops=dict(arrowstyle='->', color=line_color))

    plt.savefig("out.png", dpi=150, bbox_inches='tight')

draw_diagram()