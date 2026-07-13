import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { FloatingCard } from './components/FloatingCard';
import { Admin } from './pages/Admin';
import { Factory } from './pages/Factory';
import { Dealer } from './pages/Dealer';
import './index.css';

const navItems = [
  { path: '/admin', label: 'Admin', icon: '🏢' },
  { path: '/factory', label: 'Factory', icon: '🏭' },
  { path: '/dealer', label: 'Dealer', icon: '🚗' },
];

function App() {
  return (
    <Router>
      <div className="flex min-h-screen bg-grayBg font-sans antialiased">
        <Sidebar items={navItems} />
        <main className="flex-1 p-8 overflow-auto">
          <Routes>
            <Route path="/admin" element={<Admin />} />
            <Route path="/factory" element={<Factory />} />
            <Route path="/dealer" element={<Dealer />} />
            <Route path="*" element={<FloatingCard><h1 className='text-2xl font-bold'>Welcome to IntraMail Hub</h1></FloatingCard>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App
