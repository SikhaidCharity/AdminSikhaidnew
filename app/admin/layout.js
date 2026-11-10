import { notFound } from 'next/navigation';
import { isDisabled } from '@/lib/local-store';
import AdminGate from './_ui/AdminGate';
import './admin.css';

export const metadata = {
  title: 'Admin Panel - SikhAid Charitable Trust',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  // The panel stays off any deployed site until it has a real database and sign-in.
  if (isDisabled()) notFound();
  return <AdminGate>{children}</AdminGate>;
}
