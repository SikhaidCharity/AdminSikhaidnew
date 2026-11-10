'use client';

import Link from 'next/link';
import { SECTIONS } from '@/lib/admin-sections';
import { useAdmin } from './_ui/AdminGate';

export default function AdminDashboard() {
  const { user, name, can, signOut } = useAdmin();
  // "Project Details" lives inside Settings, so it is not a separate pill.
  const sections = SECTIONS.filter((s) => s.key !== 'settings' && can(s.key));
  const role = user.role === 'admin'
    ? `${user.owner ? 'Super Admin' : 'Admin'} · full access`
    : `Section access · ${user.sections.length} ${user.sections.length === 1 ? 'section' : 'sections'}`;

  return (
    <main className="adm-dash">
      <button type="button" className="adm-logout" onClick={signOut}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        Log Out
      </button>
      <p className="adm-exclusive"><span aria-hidden="true">🔒</span> Exclusive Access - Admin Panel</p>
      <h1>Welcome, <em>{name}</em></h1>
      <p className="adm-role">{role}</p>
      <h2>Your Control Room Awaits</h2>
      <p className="adm-intro">
        This isn&apos;t just another dashboard—this is the engine room of <b>SikhAid Charitable Trust</b>.
        <br />
        <i>Thank you for keeping us running smoother than a treadmill on max speed.</i>
      </p>
      <nav className="adm-pills" aria-label="Admin sections">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="adm-pill">{s.label}</Link>
        ))}
        {can('users') && <Link href="/admin/users" className="adm-pill adm-pill-alt">User Management</Link>}
        <Link href="/admin/settings" className="adm-pill adm-pill-alt">Settings</Link>
      </nav>
    </main>
  );
}
