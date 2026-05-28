/** Curated construction knowledge chunks — bundled for Workers (no runtime fs). */

export type PlaybookChunk = {
  id: string;
  title: string;
  trade?: string;
  stage?: string;
  topics: string[];
  content: string;
};

export const PLAYBOOK_CHUNKS: PlaybookChunk[] = [
  {
    id: 'arch-plans',
    title: 'Reading architectural plan sets',
    trade: 'architecture',
    stage: 'Planning',
    topics: ['plans', 'sheets', 'elevations', 'sections', 'details'],
    content: `Sheet index discipline: A-architectural (plans, elevations, sections, details, schedules), S-structural, M-mechanical, E-electrical, P-plumbing. Verify sheet count matches index. Key schedules: door/window, finish, appliance. Cross-reference details to plans — a note on A-5 may govern multiple rooms. Before sub bids: confirm dimensions on plan match field layout stakes. Red flags: missing fire-rated assemblies, unclear WRB termination, stair/egress not dimensioned.`,
  },
  {
    id: 'arch-envelope',
    title: 'Building science & thermal envelope',
    trade: 'architecture',
    topics: ['WRB', 'air barrier', 'insulation', 'IECC', 'moisture'],
    content: `Control layers: water (WRB), air (primary air barrier often at sheathing or interior), vapor (climate-dependent), thermal (continuous insulation where code requires). Utah cold climate: avoid vapor traps; prefer exterior rigid or conditioned attic strategies per design. IECC: fenestration U-factor, ceiling R-value, duct leakage testing — verify edition adopted locally. Blower door target often required for new construction. Flash every penetration; continuity at rim joist and garage separation.`,
  },
  {
    id: 'struct-loads',
    title: 'Structural coordination',
    trade: 'structural',
    stage: 'Framing',
    topics: ['load path', 'lateral', 'connectors', 'hold-downs', 'engineer'],
    content: `Load path: roof → walls → floors → foundation. Lateral: shear walls, portal frames, or engineered systems per S-sheets. Never notch studs in bearing without engineer approval. Hold-downs at shear wall ends per schedule — wrong anchor = failed inspection. Connector schedule is contract document: use exact Simpson (or specified) model, correct nails/screws, fill all holes. Engineered lumber (LVL, PSL) requires bearing length per manufacturer. Call engineer for field changes (window widen, beam drop).`,
  },
  {
    id: 'civil-site',
    title: 'Sitework & civil',
    trade: 'sitework',
    stage: 'Site / Foundation',
    topics: ['grading', 'drainage', 'utilities', 'compaction', 'SWPPP'],
    content: `Positive drainage away from foundation: 6" fall in 10' typical. Swales and downspout discharge away from structure. Utility locates before dig. Compaction per geotech report for fills and trench backfill. Retaining walls need drainage behind wall. Erosion control during construction per local SWPPP if disturbed area thresholds met. Set benchmarks and building corners from survey — verify garage floor elevation vs entry.`,
  },
  {
    id: 'concrete',
    title: 'Concrete & flatwork',
    trade: 'concrete',
    stage: 'Site / Foundation',
    topics: ['footings', 'walls', 'rebar', 'flatwork', 'cure'],
    content: `Footings: bearing on undisturbed soil or engineered fill; rebar cover per ACI. Walls: alignment, bracing during pour, vibrate properly, control joints. Cure: keep moist; avoid loading too early. Flatwork: subgrade prep, compacted base, joint layout (control + isolation at columns). Cold weather: protection and admixtures per spec. Inspections: footing steel before pour, wall before backfill, anchor bolt placement for sill plates.`,
  },
  {
    id: 'framing',
    title: 'Framing',
    trade: 'framing',
    stage: 'Framing',
    topics: ['platform framing', 'shear', 'fire blocking', 'hardware'],
    content: `Plumb, level, square — cumulative error kills finishes. Fire blocking at concealed spaces (soffits, stair stringers, chases) per IRC. Draft stopping at garage-house separation. Shear nailing pattern on schedule — edge spacing critical. Headers sized per plan or engineer. Advanced framing: align studs with loads and insulation. Pre-drill plates for MEP where required. Coordinate backing for cabinets, grab bars, TV mounts.`,
  },
  {
    id: 'roofing',
    title: 'Roofing',
    trade: 'roofing',
    stage: 'Insulation / Dry-in',
    topics: ['underlayment', 'ice barrier', 'ventilation', 'flashing'],
    content: `Dry-in milestone: deck sound, ice/water at eaves and valleys in snow country, synthetic underlayment, drip edge. Penetration boots and step flashing at walls. Attic ventilation: balanced intake/exhaust; don't block soffits with insulation baffles omitted. Metal valleys and crickets at dead valleys. Manufacturer warranty requires their system components and install instructions.`,
  },
  {
    id: 'mep-rough',
    title: 'Rough MEP coordination',
    trade: 'mechanical',
    stage: 'Rough MEP',
    topics: ['HVAC', 'plumbing', 'electrical', 'NEC', 'IPC', 'ventilation'],
    content: `Rough before insulation: duct sealing, combustion air, condensate routing, vent pipe slopes (plumbing), box fill calculations (electrical). Mechanical ventilation (bath fans, ERV/HRV if specified). Gas line pressure test before cover. Electrical: AFCI/GFCI per NEC edition, panel schedule matches plan, dedicated circuits for appliances. Low voltage rough with electrical — data, doorbell, alarm, exterior cameras. Coordinate ceiling drops with framing.`,
  },
  {
    id: 'electrical',
    title: 'Electrical depth',
    trade: 'electrical',
    topics: ['service', 'panel', 'NEC', 'GFCI', 'AFCI', 'clearances'],
    content: `Service size per load calc (often on plan). Panel: working clearance 36" deep, 30" wide. GFCI: kitchens, baths, exterior, garage, unfinished basements. AFCI: habitable rooms per current NEC. Smoke/CO locations per IRC. Outdoor wet locations: in-use covers, burial depth for UF. Generator/EV rough if in scope. Final: circuit directory, torque terminations, arc-fault test where required.`,
  },
  {
    id: 'plumbing',
    title: 'Plumbing depth',
    trade: 'plumbing',
    topics: ['venting', 'water heater', 'gas', 'fixtures'],
    content: `DWV: slope, cleanouts, vent termination 6" above roof (local rules vary). Test rough with water or air. Water heater: pan, drain, expansion tank if required, seismic straps in seismic zones. Recirculation pumps and insulation on hot lines. Gas: pressure test, proper pipe support, sediment trap at appliances. Fixture set-out dimensions before tile.`,
  },
  {
    id: 'hvac',
    title: 'HVAC',
    trade: 'mechanical',
    topics: ['Manual J', 'duct', 'commissioning', 'equipment'],
    content: `Equipment sized per Manual J or plan. Duct leakage test if code requires. Refrigerant lines insulated; proper pitch on condensate. Zoning and thermostats per spec. Commissioning: verify airflow, temperature split, static pressure. High-efficiency furnaces: PVC venting per manufacturer. Future STR: consider lockable thermostat guard and MERV filter access for turnovers.`,
  },
  {
    id: 'drywall',
    title: 'Drywall & finishes prep',
    trade: 'drywall',
    stage: 'Drywall',
    topics: ['levels', 'moisture', 'sound', 'tile prep'],
    content: `Level 4 typical walls, level 5 for critical lighting or smooth paint. Green board or cement board in wet areas — not standard gypsum at showers. Sound clips/channels if specified. Screw pattern and no overdriven fasteners. Primer before paint. Tile areas: flatness tolerance 1/8" in 10' for large format.`,
  },
  {
    id: 'gc-contracts',
    title: 'General contracting & contracts',
    trade: 'contracting',
    topics: ['scope', 'change order', 'schedule', 'lien', 'retainage'],
    content: `Scope: divide bid packages by trade with clear exclusions (demo, permits, temp power). Schedule: identify long-lead items (windows, cabinets, HVAC equipment). Change orders: written before work, price and time impact. Retainage: typical 5-10% until final. Utah lien law: preliminary notice and filing deadlines — protect payments with conditional lien waivers on draws. Allowances: track variance vs selections. Punch list: single consolidated walk with subs.`,
  },
  {
    id: 'value-eng',
    title: 'Value engineering',
    trade: 'contracting',
    topics: ['savings', 'alternates', 'phasing', 'allowance'],
    content: `Save without stupid: reduce finish level in low-impact areas, standardize window sizes, simplify roof geometry, bulk material buys, off-season concrete. Don't save on: foundation, structure, flashing, waterproofing. Compare bids on identical scope — normalize exclusions. Phasing work to reduce mobilization. Owner-supplied fixtures only with clear warranty boundaries.`,
  },
  {
    id: 'utah-code',
    title: 'Utah jurisdiction',
    topics: ['Utah', 'Utah County', 'Lindon', 'permit', 'inspection'],
    content: `Utah generally adopts IRC with state amendments — verify current edition with Utah County Building Department and Lindon City. Typical sequence: footing, foundation, framing, rough MEP, insulation, drywall (some AHJs), final MEP, final building. Energy code inspections may include blower door. Always confirm locally — this is reference not legal advice.`,
  },
  {
    id: 'irc-outline',
    title: 'IRC topics index',
    topics: ['IRC', 'egress', 'smoke', 'stairs', 'fire'],
    content: `Key IRC areas: R302 fire separation (garage), R310 emergency escape (bedroom egress), R311 stair geometry, R314 smoke/CO alarms, R315 carbon monoxide, ceiling heights R305, guard openings R312. Framing: R602, R802. Energy: IECC chapter reference. Use official code book for exact text — cite section then verify with AHJ.`,
  },
  {
    id: 'tile-wet',
    title: 'Tile & wet areas',
    trade: 'tile',
    stage: 'Finishes',
    topics: ['waterproofing', 'shower', 'membrane', 'movement joint'],
    content: `Flood test shower pan before tile. Bonded waterproof membrane (ANSI A118.10) in showers. Movement joints at changes of plane and large field per TCNA. Mortar coverage 95% in wet areas. Schluter/Kerdi or equivalent per spec — don't mix systems without approval.`,
  },
  {
    id: 'low-voltage',
    title: 'Low voltage & STR prep',
    trade: 'low voltage',
    topics: ['prewire', 'wifi', 'security', 'smart lock'],
    content: `Prewire: mesh WiFi AP locations, doorbell, cameras (soffit/eave), TV drops if desired. Conduit for future runs. Smart lock power at entry. Label homerun panel. STR future: lockbox location, noise considerations, durable LVP and washable paint.`,
  },
  {
    id: 'common-mistakes',
    title: 'Common jobsite mistakes',
    topics: ['mistakes', 'moisture', 'sequence', 'inspection'],
    content: `Top failures: skipped flashing, insulation before blower-door prep done wrong, MEP buried without photo, wrong window rough opening, concrete sawcut too late, no capillary break at sill, grading toward house, subs not reading revisions. Fix: weekly walk, RFI log, photo log at close-in, hold payment until inspection passed.`,
  },
  {
    id: 'trade-sequences',
    title: 'Trade sequences by stage',
    topics: ['sequence', 'stage', 'inspection'],
    content: `Site/Foundation: survey, excavate, footings, foundation walls/slab, waterproofing, backfill compacted. Framing: sill, floors, walls, roof, sheathing, windows. Rough MEP: HVAC duct, plumbing DWV/supply, electrical boxes. Dry-in: roofing, WRB. Insulation/air seal. Drywall. Finishes: prime, paint, cabinets, trim, tile, floors. Final: MEP trim, appliances, punch, clean.`,
  },
];
