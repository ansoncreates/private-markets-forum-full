// One array drives the jackets, the record labels, the DOM overlay and the
// no-WebGL fallback grid. Order = browse order, left to right.

export const RECORDS = [
  {
    id: 'report-2026', status: 'available', catalogue: 'PMF 001',
    title: 'Capital built the industry. Infrastructure will define its next era.',
    short: 'Report 2026', eyebrow: 'Executive Report', meta: 'London · 25 June 2026',
    tag: 'Inaugural Summit', href: 'Reports/report-2026.html',
    pdf: 'Reports/Assets/report-2026.pdf', plate: 'radial-navy',
  },
  {
    id: 'infrastructure-at-the-edge-of-scale', status: 'available', catalogue: 'PMF 002',
    title: 'Infrastructure at the edge of scale', short: 'Infrastructure',
    eyebrow: 'Survey findings', meta: 'March 2026', tag: 'Private credit',
    href: 'Reports/infrastructure-at-the-edge-of-scale.html',
    pdf: 'Reports/Assets/infrastructure-at-the-edge-of-scale.pdf',
    plate: 'edge-lit',
  },
  { id: 'soon-3', status: 'soon', catalogue: 'PMF 003', title: 'Coming Soon', plate: 'cream' },
  { id: 'soon-4', status: 'soon', catalogue: 'PMF 004', title: 'Coming Soon', plate: 'ice' },
  { id: 'soon-5', status: 'soon', catalogue: 'PMF 005', title: 'Coming Soon', plate: 'slate' },
];

export const BRAND = {
  navy: '#090C2A', blue: '#0D1DCC', ice: '#C8DFF3', cream: '#F6F4F2', slate: '#464850', white: '#FFFFFF',
};
