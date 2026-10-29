import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../utils/roles.js';

async function findUserOr404(id) {
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404);
  return user;
}

// Stop the system from ending up with no active admin.
async function assertNotLastAdmin(user) {
  if (user.role !== ROLES.ADMIN || !user.isActive) return;
  const activeAdmins = await User.countDocuments({ role: ROLES.ADMIN, isActive: true });
  if (activeAdmins <= 1) throw new AppError('Cannot remove or disable the last active admin', 400);
}

export async function listUsers(req, res) {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  const users = await User.find(filter).sort({ createdAt: -1 });
  res.json({ users });
}

export async function getUser(req, res) {
  res.json({ user: await findUserOr404(req.params.id) });
}

export async function createUser(req, res) {
  const user = await User.create(req.body);
  res.status(201).json({ user });
}

export async function updateUser(req, res) {
  const user = await findUserOr404(req.params.id);
  const { name, role, isActive, password } = req.body;

  const losingAdmin = (role && role !== ROLES.ADMIN) || isActive === false;
  if (losingAdmin) await assertNotLastAdmin(user);

  if (name !== undefined) user.name = name;
  if (role !== undefined) user.role = role;
  if (isActive !== undefined) user.isActive = isActive;
  if (password !== undefined) user.password = password;

  await user.save();
  res.json({ user });
}

export async function deleteUser(req, res) {
  if (req.params.id === req.user.id) throw new AppError('You cannot delete your own account', 400);
  const user = await findUserOr404(req.params.id);
  await assertNotLastAdmin(user);
  await user.deleteOne();
  res.status(204).end();
}
