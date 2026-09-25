const fs = require('node:fs');
const path = require('node:path');
const cds = require('@sap/cds');
const imageSize = require('../srv/model/PlanImage');
const Time = require('../app/model/Time');
const directory = path.join(__dirname, '../db/data');
const id = (group, n) => `${group}-0000-4000-8000-${String(n).padStart(12, '0')}`;

function demoData() {
  const image = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(directory, 'office-plan.jpg')).toString('base64');
  const { width, height } = imageSize(image);
  const data = { Buildings: [], Floors: [], Resources: [], FloorObjects: [], ResourceEquipment: [] };
  // Coordinates follow the desks and enclosed rooms in office-plan.jpg (1466 x 803).
  const desks = [[34,31,123,94],[163,31,121,94],[34,263,123,94],[284,208,92,122],[34,362,123,90],[386,81,124,91],[572,120,124,60],[701,120,123,60],[733,183,91,123],[386,177,124,92],[387,375,123,60]];
  const rooms = [[943,27,493,540,8],[28,537,294,237,4],[338,552,281,221,3]];
  const parkingPlan = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><rect width="1000" height="600" fill="#edf3fa"/><path d="M30 285H970 M30 315H970" stroke="#9aabc1" stroke-width="3" stroke-dasharray="24 16"/><path d="M40 60H960V245H40Z M40 355H960V540H40Z" fill="#fff" stroke="#9aabc1" stroke-width="3"/></svg>';
  for (const [index, city] of ['Hannover', 'Berlin', 'Warsaw'].entries()) {
    const n = index + 1, floor = id('40000000', n), lot = id('d3000000', n), level = id('d4000000', n + 10);
    data.Buildings.push({ ID: lot, site_ID: id('20000000', n), code: 'DEMO-P', name: `${city} Demo Parking`, kind: 'PARKING', active: true });
    data.Floors.push({ ID: floor, building_ID: id('30000000', n), code: 'DEMO', name: 'Demo office floor', number: 2, active: true, planImage: image, planImageName: 'office-plan.jpg', planWidth: width, planHeight: height });
    data.Floors.push({ ID: level, building_ID: lot, code: 'G', name: 'Demo ground parking', number: 0, active: true, floorPlan: parkingPlan, planWidth: 1000, planHeight: 600 });
    const add = (local, type, code, name, coordinates, capacity = 1) => {
      const number = n * 100 + local, resource = id('d5000000', number), parking = type === 'PARKING';
      const [x, y, w, h] = coordinates;
      data.Resources.push({ ID: resource, floor_ID: parking ? level : floor, type, code, name: `${city} ${name}`, capacity, roomType: type === 'ROOM' ? 'MEETING' : '', workplaceType: type === 'WORKPLACE' ? 'FLEX' : '', monitorCount: type === 'WORKPLACE' ? 1 + local % 2 : 0, active: true });
      data.FloorObjects.push({ ID: id('d6000000', number), floor_ID: parking ? level : floor, resource_ID: resource, name: `${city} ${name}`, type: type === 'WORKPLACE' ? 'DESK' : type, x, y, width: w, height: h, radius: 8, color: '#0064d9', opacity: 0.25 });
      const equipment = type === 'ROOM' ? [1,2] : type === 'WORKPLACE' ? [3] : [];
      for (const eq of equipment) data.ResourceEquipment.push({ ID: id('d9100000', number * 10 + eq), resource_ID: resource, equipment_ID: id('90000000', eq), quantity: 1 });
    };
    desks.forEach((rect, i) => add(i + 1, 'WORKPLACE', `DEMO-D${i + 1}`, `Demo Desk ${i + 1}`, rect));
    rooms.forEach((rect, i) => add(21 + i, 'ROOM', `DEMO-R${i + 1}`, `Demo Meeting Room ${i + 1}`, rect, rect[4]));
    for (let i = 0; i < 12; i++) add(41 + i, 'PARKING', `P${String(i + 1).padStart(2, '0')}`, `Parking P${String(i + 1).padStart(2, '0')}`, [55 + (i % 6) * 150, i < 6 ? 75 : 370, 135, 155]);
  }
  addBookings(data);
  return data;
}

function addBookings(data) {
  Object.assign(data, { Users: [], TeamMembers: [], WorkDays: [], Bookings: [] });
  const colleagues = [
    ['Lena Fischer', 'lena@example.de'], ['Jonas Weber', 'jonas@example.de'],
    ['Emma Schneider', 'emma@example.de'], ['Felix Bauer', 'felix@example.de'],
    ['Marta Kowalska', 'marta@example.com'], ['Piotr Nowak', 'piotr@example.com']
  ];
  const existing = ['Anna Example', 'Max Example', 'Ola Example'];
  for (let city = 0; city < 3; city++) {
    const site = id('20000000', city + 1), zone = city === 2 ? 'Europe/Warsaw' : 'Europe/Berlin';
    for (let seat = 0; seat < 3; seat++) {
      const person = city * 3 + seat + 1, colleague = city * 2 + seat - 1;
      const user = seat === 0 ? id('60000000', city + 1) : id('d6100000', colleague + 1);
      const name = seat === 0 ? existing[city] : colleagues[colleague][0];
      if (seat !== 0) {
        data.Users.push({ ID: user, company_ID: id('10000000', 1), email: colleagues[colleague][1], displayName: name, role: 'USER', defaultSite_ID: site, active: true });
        data.TeamMembers.push({ ID: id('d7100000', colleague + 1), team_ID: id('70000000', 1), user_ID: user });
      }
      const officeDays = seat === 0 ? (city === 2 ? [1, 3, 4, 5] : [1, 2, 4, 5]) : seat === 1 ? [1, 2, 4] : [2, 3, 5];
      const meetingDay = seat === 0 ? (city === 2 ? 4 : 2) : seat === 1 ? 4 : 3;
      for (let day = '2026-09-20'; day <= '2026-11-20'; day = Time.addDays(day, 1)) {
        const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        const office = officeDays.includes(weekday), key = Number(day.replaceAll('-', '')) * 100 + person;
        data.WorkDays.push({ ID: id('d8200000', key), user_ID: user, site_ID: office ? site : null, date: day, mode: office ? 'OFFICE' : 'HOME', startTime: '09:00:00', endTime: '17:00:00', notes: 'Demo: autumn work schedule' });
        if (!office) continue;
        const book = (kind, local, title, start, end, attendeeCount = 1) => {
          data.Bookings.push({ ID: id('d7200000', key * 10 + kind), resource_ID: id('d5000000', (city + 1) * 100 + local), user_ID: user, title: `${title} - ${name}`, ...Time.interval(day, start, end, zone), status: 'CONFIRMED', attendeeCount, notes: 'Demo: 20 September - 20 November 2026', source: 'RSVROOM' });
        };
        book(1, seat + 1, 'Office day', '09:00', '17:00');
        if (seat !== 1) book(2, 41 + seat, 'Office parking', '09:00', '17:00');
        if (weekday === meetingDay) book(3, 21 + seat, 'Team meeting', '10:00', '11:00', 3);
      }
    }
  }
}

function writeCsv(data) {
  for (const [entity, rows] of Object.entries(data)) {
    const file = path.join(directory, `rsvroom-${entity}.csv`);
    const previous = fs.existsSync(file) ? cds.parse.csv(fs.readFileSync(file, 'utf8')) : [];
    const [oldColumns = [], ...oldRows] = previous;
    const existing = oldRows.map(row => Object.fromEntries(oldColumns.map((key, i) => [key, row[i]])));
    const ids = new Set(rows.map(row => row.ID));
    const defaults = entity === 'Buildings' ? { kind: 'BUILDING' } : entity === 'Floors' ? { planWidth: 1000, planHeight: 600 } : {};
    const superseded = entity === 'Floors' ? new Set([1, 2, 3].map(n => id('d4000000', n))) : new Set();
    const merged = existing.filter(row => !ids.has(row.ID) && !superseded.has(row.ID)).map(row => {
      for (const [key, value] of Object.entries(defaults)) if (!row[key]) row[key] = value;
      return row;
    }).concat(rows);
    const columns = [...new Set([...oldColumns, ...rows.flatMap(Object.keys)])];
    const escape = value => /[;"\r\n]/.test(String(value ?? '')) ? '"' + String(value).replaceAll('"', '""') + '"' : String(value ?? '');
    fs.writeFileSync(file, [columns.join(';'), ...merged.map(row => columns.map(key => escape(row[key])).join(';'))].join('\n') + '\n');
  }
}

async function seed(db, data = demoData()) {
  const counts = {};
  await db.tx(async tx => {
    // Keep the original floor IDs and their bookings; move records from the
    // previously generated, redundant office floors before removing them.
    for (let n = 1; n <= 3; n++) {
      const floorID = id('40000000', n), duplicateID = id('d4000000', n);
      const [original] = await tx.run(cds.ql.SELECT.from('rsvroom.Floors').where({ ID: floorID }));
      const [duplicate] = await tx.run(cds.ql.SELECT.from('rsvroom.Floors').where({ ID: duplicateID }));
      const demo = data.Floors.find(row => row.ID === floorID);
      if (original) {
        const changes = { name: demo.name, number: demo.number };
        if (!original.planImage && !original.floorPlan)
          Object.assign(changes, { planImage: demo.planImage, planImageName: demo.planImageName, planWidth: demo.planWidth, planHeight: demo.planHeight });
        await tx.run(cds.ql.UPDATE('rsvroom.Floors').set(changes).where({ ID: floorID }));
      }
      if (duplicate) {
        await tx.run(cds.ql.UPDATE('rsvroom.Resources').set({ floor_ID: floorID }).where({ floor_ID: duplicateID }));
        await tx.run(cds.ql.UPDATE('rsvroom.FloorObjects').set({ floor_ID: floorID }).where({ floor_ID: duplicateID }));
        await tx.run(cds.ql.DELETE.from('rsvroom.Floors').where({ ID: duplicateID }));
      }
      if (original && original.code !== demo.code)
        await tx.run(cds.ql.UPDATE('rsvroom.Floors').set({ code: demo.code }).where({ ID: floorID }));
    }
    for (const [entity, rows] of Object.entries(data)) {
      const table = `rsvroom.${entity}`;
      const records = await tx.run(cds.ql.SELECT.from(table));
      const existing = new Set(records.map(row => row.ID));
      let missing = rows.filter(row => !existing.has(row.ID));
      if (entity === 'WorkDays') {
        const planned = new Set(records.map(row => `${row.user_ID}/${row.date}`));
        missing = missing.filter(row => !planned.has(`${row.user_ID}/${row.date}`));
      }
      if (entity === 'Bookings') {
        const days = new Map((await tx.run(cds.ql.SELECT.from('rsvroom.WorkDays'))).map(row => [`${row.user_ID}/${row.date}`, row]));
        const demoDays = new Map(data.WorkDays.map(row => [`${row.user_ID}/${row.date}`, row]));
        missing = missing.filter(row => {
          const key = `${row.user_ID}/${row.startAt.slice(0, 10)}`, day = days.get(key);
          return day?.mode === 'OFFICE' && day.site_ID === demoDays.get(key)?.site_ID && !records.some(other => other.resource_ID === row.resource_ID && Time.overlaps(other, row));
        });
      }
      if (missing.length) await tx.run(cds.ql.INSERT.into(table).entries(missing));
      counts[entity] = missing.length;
    }
  });
  return counts;
}

module.exports = { demoData, seed, writeCsv };
if (require.main === module) (async () => {
  if (process.argv.includes('--generate')) { writeCsv(demoData());console.log('Demo CSV data generated.');return; }
  if (process.env.BACKEND_URL) throw new Error('Demo import requires local CAP: clear BACKEND_URL first.');
  const db = await require('./deploy')();
  try { console.log('Added demo records:', await seed(db)); } finally { await db.disconnect(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
