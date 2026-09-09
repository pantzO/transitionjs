/*!
 * graph.js — draw function graphs in an <svg> (companion of transition.js)
 *
 *   const g = new graph(svgElement, [xmin, ymin, xmax, ymax]);
 *   g.axes(strokeWidth);
 *   g.plot(x => Math.cos(x), [xmin, xmax], 160, 'stroke-width:2', 'myClass', 'myId');
 *   g.plotXY(t => Math.cos(t), t => Math.sin(t), [0, 2 * Math.PI], 200, 'stroke-width:2');
 *
 * Strokes use `currentColor`: set `color` on the svg (or inherit it) to
 * change the drawing colour. Axes end with an arrow marker.
 */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (name, attrs = {}) => {
    const el = document.createElementNS(NS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  class graph {
    constructor(target, win) {
      [this.Xmin, this.Ymin, this.Xmax, this.Ymax] = win;
      const r = target.getBoundingClientRect();
      this.width = r.width; this.height = r.height;
      this.ScaleX = this.width / (this.Xmax - this.Xmin);
      this.ScaleY = this.height / (this.Ymax - this.Ymin);
      this.target = target;
      target.setAttribute('viewBox', '0 0 ' + this.width + ' ' + this.height);
    }
    getX(x) { return (x - this.Xmin) * this.ScaleX; }
    getY(y) { return (this.Ymax - y) * this.ScaleY; }

    axes(strokeWidth = 1) {
      const style = 'stroke:currentColor; stroke-width:' + strokeWidth;
      this.target.appendChild(svgEl('line', {
        x1: 0, y1: this.getY(0), x2: this.width, y2: this.getY(0),
        style, 'marker-end': 'url(#graphArrow)',
      }));
      this.target.appendChild(svgEl('line', {
        x1: this.getX(0), y1: this.height, x2: this.getX(0), y2: 0,
        style, 'marker-end': 'url(#graphArrow)',
      }));
    }

    _polyline(points, style, classes, id) {
      const p = svgEl('polyline', {
        points, style: 'stroke:currentColor;' + (style || ''),
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', fill: 'none',
      });
      if (classes) p.setAttribute('class', classes);
      if (id) p.id = id;
      this.target.appendChild(p);
      return p;
    }

    /** Plot y = f(x) on [xmin, xmax] with N+1 points. */
    plot(f, domain, N, style, classes, id) {
      const [a, b] = domain, pts = [];
      for (let k = 0; k <= N; k++) {
        const x = a + (b - a) * k / N;
        pts.push(this.getX(x) + ',' + this.getY(f(x)));
      }
      return this._polyline(pts.join(' '), style, classes, id);
    }

    /** Plot the parametric curve (fx(t), fy(t)) on [tmin, tmax] with N+1 points. */
    plotXY(fx, fy, domain, N, style, classes, id) {
      const [a, b] = domain, pts = [];
      for (let k = 0; k <= N; k++) {
        const t = a + (b - a) * k / N;
        pts.push(this.getX(fx(t)) + ',' + this.getY(fy(t)));
      }
      return this._polyline(pts.join(' '), style, classes, id);
    }
  }

  /* Arrow marker shared by all graphs, in an invisible <svg>. */
  function defineArrow() {
    if (document.getElementById('graphArrow')) return;
    const svg = svgEl('svg', { width: 0, height: 0, style: 'position:absolute', 'aria-hidden': 'true' });
    const defs = svgEl('defs');
    const marker = svgEl('marker', {
      id: 'graphArrow', viewBox: '-9 -3 9 6', orient: 'auto',
      markerUnits: 'strokeWidth', markerWidth: 18, markerHeight: 12,
    });
    marker.appendChild(svgEl('path', { d: 'M0,0 L-9,3 L-9,-3 z', fill: 'currentColor' }));
    defs.appendChild(marker);
    svg.appendChild(defs);
    (document.body || document.documentElement).appendChild(svg);
  }
  if (document.body) defineArrow(); else document.addEventListener('DOMContentLoaded', defineArrow);

  window.graph = graph;
})();
