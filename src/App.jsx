import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Hero from './sections/Hero/Hero';
import Collection from './sections/Collection/Collection';
import ProductDetails from './sections/ProductDetails/ProductDetails';
import About from './sections/About/About';
import Journey from './sections/Journey/Journey';
import styles from './App.module.css';

/**
 * AnimatedRoutes — uses location key to trigger CSS re-mount animation
 * Each route change causes the wrapper to re-render with the slide-in keyframe
 */
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <div key={location.pathname} className={styles.page}>
      <Routes location={location}>
        <Route path="/" element={<Hero />} />
        <Route path="/collection" element={<Collection />} />
        <Route path="/product/:productId" element={<ProductDetails />} />
        <Route path="/about" element={<About />} />
        <Route path="/journey" element={<Journey />} />
        {/* Fallback */}
        <Route path="*" element={<Hero />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

export default App;
