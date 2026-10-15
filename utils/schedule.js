const AppError = require('./AppError');

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeSchedule({ days, startTime, endTime }) {
  const selected = Array.isArray(days) ? days : [];
  const unique = WEEKDAYS.filter((day) => selected.includes(day));
  if (selected.some((day) => !WEEKDAYS.includes(day))) {
    throw new AppError('Choose class days from Monday through Sunday.', 400);
  }
  const start = String(startTime || '').trim();
  const end = String(endTime || '').trim();
  if ((start && !end) || (!start && end)) {
    throw new AppError('Enter both a start time and an end time.', 400);
  }
  if (start && !TIME_PATTERN.test(start)) throw new AppError('Start time must use HH:MM.', 400);
  if (end && !TIME_PATTERN.test(end)) throw new AppError('End time must use HH:MM.', 400);
  if (start && end && start >= end) throw new AppError('End time must be after the start time.', 400);
  return { days: unique, startTime: start, endTime: end };
}

function scheduleFields(course) {
  return {
    days: Array.isArray(course?.days) ? course.days : [],
    startTime: course?.startTime || '',
    endTime: course?.endTime || '',
  };
}

module.exports = {
  WEEKDAYS,
  TIME_PATTERN,
  normalizeSchedule,
  scheduleFields,
};
