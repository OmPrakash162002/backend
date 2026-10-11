// Usage: npm run set-role -- someone@company.com reviewer
// Public registration always creates employees. This is how you create the first reviewer:
// register in the app, then promote that account here. No password is typed on the command line.
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import User from '../models/User.js';

const [email, role] = process.argv.slice(2);
if (!email || !['employee', 'reviewer'].includes(role)) {
  console.error('Usage: npm run set-role -- <email> <employee|reviewer>');
  process.exit(1);
}

await connectDb();
const user = await User.findOneAndUpdate({ email: email.trim().toLowerCase() }, { role }, { new: true });
console.log(user ? `${user.email} is now a ${user.role}.` : `No user found with email ${email}.`);
await mongoose.disconnect();
process.exit(user ? 0 : 1);
