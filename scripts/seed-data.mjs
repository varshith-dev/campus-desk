// Writes the fictional sample data for Eastbrook Institute of Technology into data/seed/.
// Everything here is made up. Run: npm run seed
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join(import.meta.dirname, '..', 'data', 'seed');
mkdirSync(out, { recursive: true });
const write = (name, value) => writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n');

write('department.json', {
  sample: true,
  institute: 'Eastbrook Institute of Technology',
  department: 'Department of Computer Science and Engineering',
  short: 'EIT CSE',
  semester: 'Autumn 2026',
  sample_today: '2026-11-16',
  sample_now: '2026-11-16T10:20',
  disclaimer: 'Eastbrook Institute of Technology is a made-up place. Every name, date, room and amount on this site is sample data.',
  office: { place: 'Block C, Room 104', hours: 'Monday to Friday, 10:00 to 16:00', email: 'cse-office@eastbrook.example' },
  years: [2, 3],
  sections: ['A', 'B'],
  fee_categories: [
    { id: 'general', label: 'General' },
    { id: 'scholarship', label: 'Scholarship' },
    { id: 'sponsored', label: 'Employer sponsored' },
  ],
});

const courses = [
  { code: 'CS201', name: 'Data Structures', year: 2, faculty: 'Dr. R. Menon' },
  { code: 'CS202', name: 'Digital Logic', year: 2, faculty: 'Prof. A. Kapoor' },
  { code: 'CS203', name: 'Discrete Mathematics', year: 2, faculty: 'Dr. S. Banerjee' },
  { code: 'CS204', name: 'Object-Oriented Programming', year: 2, faculty: 'Prof. L. Fernandes' },
  { code: 'MA201', name: 'Probability and Statistics', year: 2, faculty: 'Dr. P. Nair' },
  { code: 'CS201L', name: 'Data Structures Lab', year: 2, faculty: 'Prof. L. Fernandes', lab: true },
  { code: 'CS301', name: 'Operating Systems', year: 3, faculty: 'Dr. K. Rao' },
  { code: 'CS302', name: 'Database Systems', year: 3, faculty: 'Dr. M. Thomas' },
  { code: 'CS303', name: 'Computer Networks', year: 3, faculty: 'Prof. D. Sharma' },
  { code: 'CS304', name: 'Software Engineering', year: 3, faculty: 'Prof. N. Joshi' },
  { code: 'HS301', name: 'Technical Communication', year: 3, faculty: 'Dr. V. Pillai' },
  { code: 'CS302L', name: 'Database Lab', year: 3, faculty: 'Dr. M. Thomas', lab: true },
];

const S = { a: ['09:00', '09:50'], b: ['10:00', '10:50'], c: ['11:15', '12:05'], d: ['12:15', '13:05'], lab: ['14:00', '16:50'] };
const slot = (s, code, room) => ({ start: S[s][0], end: S[s][1], course: code, room });

const weekly = {
  '2A': {
    Mon: [slot('a', 'CS201', 'C-201'), slot('b', 'CS203', 'C-201'), slot('c', 'MA201', 'C-201'), slot('lab', 'CS201L', 'Lab 2')],
    Tue: [slot('a', 'CS202', 'C-201'), slot('b', 'CS201', 'C-201'), slot('c', 'CS204', 'C-201')],
    Wed: [slot('a', 'CS203', 'C-201'), slot('b', 'CS204', 'C-201'), slot('c', 'CS202', 'C-201'), slot('d', 'MA201', 'C-201')],
    Thu: [slot('a', 'MA201', 'C-201'), slot('b', 'CS202', 'C-201'), slot('lab', 'CS201L', 'Lab 2')],
    Fri: [slot('a', 'CS204', 'C-201'), slot('b', 'CS203', 'C-201'), slot('c', 'CS201', 'C-201')],
  },
  '2B': {
    Mon: [slot('a', 'CS203', 'C-202'), slot('b', 'CS201', 'C-202'), slot('c', 'CS204', 'C-202')],
    Tue: [slot('a', 'MA201', 'C-202'), slot('b', 'CS202', 'C-202'), slot('lab', 'CS201L', 'Lab 3')],
    Wed: [slot('a', 'CS201', 'C-202'), slot('b', 'CS203', 'C-202'), slot('c', 'MA201', 'C-202')],
    Thu: [slot('a', 'CS204', 'C-202'), slot('b', 'CS201', 'C-202'), slot('c', 'CS202', 'C-202'), slot('d', 'CS203', 'C-202')],
    Fri: [slot('a', 'CS202', 'C-202'), slot('b', 'MA201', 'C-202'), slot('lab', 'CS201L', 'Lab 3')],
  },
  '3A': {
    Mon: [slot('a', 'CS301', 'C-301'), slot('b', 'CS302', 'C-301'), slot('c', 'CS303', 'C-301')],
    Tue: [slot('a', 'CS304', 'C-301'), slot('b', 'CS301', 'C-301'), slot('lab', 'CS302L', 'Lab 4')],
    Wed: [slot('a', 'CS302', 'C-301'), slot('b', 'CS303', 'C-301'), slot('c', 'HS301', 'C-301'), slot('d', 'CS304', 'C-301')],
    Thu: [slot('a', 'CS303', 'C-301'), slot('b', 'CS304', 'C-301'), slot('c', 'CS301', 'C-301')],
    Fri: [slot('a', 'HS301', 'C-301'), slot('b', 'CS302', 'C-301'), slot('lab', 'CS302L', 'Lab 4')],
  },
  '3B': {
    Mon: [slot('a', 'CS302', 'C-302'), slot('b', 'CS304', 'C-302'), slot('lab', 'CS302L', 'Lab 5')],
    Tue: [slot('a', 'CS303', 'C-302'), slot('b', 'CS302', 'C-302'), slot('c', 'CS301', 'C-302')],
    Wed: [slot('a', 'CS301', 'C-302'), slot('b', 'HS301', 'C-302'), slot('c', 'CS304', 'C-302')],
    Thu: [slot('a', 'CS304', 'C-302'), slot('b', 'CS303', 'C-302'), slot('c', 'CS302', 'C-302'), slot('d', 'CS301', 'C-302')],
    Fri: [slot('a', 'CS303', 'C-302'), slot('b', 'CS301', 'C-302'), slot('c', 'HS301', 'C-302')],
  },
};

const timetables = Object.entries(weekly).map(([key, days]) => ({ year: Number(key[0]), section: key[1], days }));

const changes = [
  { date: '2026-11-18', year: 2, section: 'A', course: 'CS203', kind: 'cancelled', detail: 'The faculty member is on leave. Notes will be posted on the notice board.' },
  { date: '2026-11-19', year: 3, section: 'all', course: 'CS303', kind: 'room', detail: 'Moved to room C-305 because of projector repair.', new_room: 'C-305' },
  { date: '2026-11-20', year: 2, section: 'B', course: 'MA201', kind: 'time', detail: 'Moved to 14:00 to 14:50 in room C-202 because the faculty member is at a conference in the morning.', new_start: '14:00', new_end: '14:50' },
];

write('timetable.json', { semester: 'Autumn 2026', slots: S, courses, timetables, changes });

const notices = [
  { id: 'n-01', date: '2026-11-14', category: 'exams', years: [2, 3], title: 'End-semester exam timetable published', body: 'The end-semester exams run from 14 to 23 December 2026. The full dates are on the Fees and exams page. Hall tickets are given out from 7 December.' },
  { id: 'n-02', date: '2026-11-13', category: 'fees', years: [2, 3], title: 'Tuition installment 2 is due on 30 November', body: 'Pay at the accounts window or online. A late fee applies for each day after the due date. Scholarship students should check the amount for their category.', deadline: '2026-11-30' },
  { id: 'n-03', date: '2026-11-12', category: 'academic', years: [3], title: 'Project review week for Year 3', body: 'Reviews for the software engineering projects run from 23 to 27 November. Teams get their slot by email from the project coordinator.', deadline: '2026-11-23' },
  { id: 'n-04', date: '2026-11-10', category: 'events', years: [2, 3], title: 'Tech talk: how a database reads your query', body: 'A guest talk on query plans, on 20 November at 15:00 in the seminar hall. All years can attend. Year 2 section B has one class moved to 14:00 that day, so it does not clash.', deadline: '2026-11-20' },
  { id: 'n-05', date: '2026-11-09', category: 'placement', years: [3], title: 'Resume workshop for Year 3', body: 'A hands-on session on writing a one-page resume, on 24 November at 16:00 in room C-301. Bring a printed draft.', deadline: '2026-11-24' },
  { id: 'n-06', date: '2026-11-08', category: 'admin', years: [2, 3], title: 'Hall tickets: collect from the department office', body: 'Hall tickets are given out from 7 December. Bring your student ID. The exam fee must be paid first.', deadline: '2026-12-07' },
  { id: 'n-07', date: '2026-11-06', category: 'academic', years: [2, 3], title: 'Lab practical exams start on 25 November', body: 'Data Structures Lab (Year 2) is on 25 November and Database Lab (Year 3) is on 26 November. Carry your lab record.', deadline: '2026-11-25' },
  { id: 'n-08', date: '2026-11-05', category: 'fees', years: [2, 3], title: 'Scholarship students: renew your income certificate', body: 'Submit the renewed certificate to the department office by 28 November, or the installment waiver will not be applied.', deadline: '2026-11-28' },
  { id: 'n-09', date: '2026-11-03', category: 'events', years: [2, 3], title: 'Department club hack night on 6 December', body: 'An overnight build session in the labs, from 18:00 on 6 December. Teams of up to four. Sign up with the club coordinators.', deadline: '2026-12-05' },
  { id: 'n-10', date: '2026-11-02', category: 'academic', years: [2, 3], title: 'Attendance shortage list is on the notice board', body: 'Students below 75 percent attendance can submit a condonation form with a reason by 24 November.', deadline: '2026-11-24' },
  { id: 'n-11', date: '2026-10-28', category: 'admin', years: [2, 3], title: 'Department office closed on 27 November', body: 'The office is closed for the whole day for maintenance. Submit anything due that week by 26 November.', deadline: '2026-11-27' },
  { id: 'n-12', date: '2026-10-25', category: 'exams', years: [2, 3], title: 'Mid-term revaluation window closes on 21 November', body: 'Apply for revaluation at the office with the fee receipt. Late forms are not taken.', deadline: '2026-11-21' },
];
write('notices.json', { notices });

write('fees.json', {
  categories: ['general', 'scholarship', 'sponsored'],
  items: [
    { id: 'tuition-2', name: 'Tuition, installment 2', years: [2, 3], due: '2026-11-30', amounts: { general: 42500, scholarship: 0, sponsored: 21250 }, late_fee_per_day: 100, late_fee_cap: 1000, note: 'Scholarship students pay nothing if the income certificate is renewed by 28 November.' },
    { id: 'exam-fee', name: 'End-semester exam fee', years: [2, 3], due: '2026-11-25', amounts: { general: 1800, scholarship: 1800, sponsored: 1800 }, late_fee_per_day: 200, late_fee_cap: 1000, note: 'The receipt is needed to collect the hall ticket.' },
    { id: 'lab-fee-3', name: 'Database lab consumables', years: [3], due: '2026-11-30', amounts: { general: 1200, scholarship: 1200, sponsored: 1200 }, late_fee_per_day: 50, late_fee_cap: 500, note: 'Year 3 only.' },
  ],
  currency: 'Rs',
});

write('exams.json', {
  hall_ticket_release: '2026-12-07',
  rules: 'Carry your student ID and hall ticket. Phones stay in your bag, switched off.',
  exams: [
    { year: 2, course: 'CS201L', type: 'Lab practical', date: '2026-11-25', start: '10:00', end: '13:00', venue: 'Lab 2 and Lab 3' },
    { year: 3, course: 'CS302L', type: 'Lab practical', date: '2026-11-26', start: '10:00', end: '13:00', venue: 'Lab 4 and Lab 5' },
    { year: 2, course: 'CS201', type: 'End-semester', date: '2026-12-14', start: '10:00', end: '13:00', venue: 'Exam Hall A' },
    { year: 3, course: 'CS301', type: 'End-semester', date: '2026-12-15', start: '10:00', end: '13:00', venue: 'Exam Hall B' },
    { year: 2, course: 'CS203', type: 'End-semester', date: '2026-12-16', start: '10:00', end: '13:00', venue: 'Exam Hall A' },
    { year: 3, course: 'CS302', type: 'End-semester', date: '2026-12-17', start: '10:00', end: '13:00', venue: 'Exam Hall B' },
    { year: 2, course: 'CS202', type: 'End-semester', date: '2026-12-18', start: '10:00', end: '13:00', venue: 'Exam Hall A' },
    { year: 3, course: 'CS303', type: 'End-semester', date: '2026-12-19', start: '10:00', end: '13:00', venue: 'Exam Hall B' },
    { year: 2, course: 'CS204', type: 'End-semester', date: '2026-12-21', start: '10:00', end: '13:00', venue: 'Exam Hall A' },
    { year: 3, course: 'CS304', type: 'End-semester', date: '2026-12-22', start: '10:00', end: '13:00', venue: 'Exam Hall B' },
    { year: 2, course: 'MA201', type: 'End-semester', date: '2026-12-23', start: '14:00', end: '17:00', venue: 'Exam Hall A' },
    { year: 3, course: 'HS301', type: 'End-semester', date: '2026-12-23', start: '14:00', end: '17:00', venue: 'Exam Hall B' },
  ],
});
console.log('Sample data written to data/seed/');
