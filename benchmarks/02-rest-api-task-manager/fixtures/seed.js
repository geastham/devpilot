// Taskforge Test Seed Data
// Used by acceptance test harness, NOT by the app itself

const testUsers = [
  { email: 'alice@test.com', password: 'password123', name: 'Alice' },
  { email: 'bob@test.com', password: 'password456', name: 'Bob' }
];

const testTasks = [
  { title: 'Write documentation', description: 'Write API docs for Taskforge', priority: 'high' },
  { title: 'Fix login bug', description: 'Users cant login with special chars', priority: 'urgent' },
  { title: 'Add dark mode', description: 'Implement dark mode toggle', priority: 'low' },
  { title: 'Database backup script', description: 'Automate daily backups', priority: 'medium' }
];

const testLabels = [
  { name: 'bug', color: '#ff0000' },
  { name: 'feature', color: '#00ff00' },
  { name: 'documentation', color: '#0000ff' }
];

module.exports = { testUsers, testTasks, testLabels };
