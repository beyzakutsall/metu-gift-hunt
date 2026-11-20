// Kuşbakışı kamera: fareyle/parmakla döndürme, yakınlaştırma ve kaydırma
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IZGARA } from './projeksiyon.js';

export function kameraKontrolleriniKur(kamera, tuval, hedef) {
  kamera.position.set(hedef.x, hedef.y + 110, hedef.z + 130);

  const kontroller = new OrbitControls(kamera, tuval);
  kontroller.target.copy(hedef);
  kontroller.enableDamping = true;
  kontroller.dampingFactor = 0.08;
  kontroller.screenSpacePanning = false; // kaydırma yere paralel olsun
  kontroller.minDistance = 12;
  kontroller.maxDistance = 600;
  kontroller.minPolarAngle = 0.1;        // tam tepeden bakışa yakın
  kontroller.maxPolarAngle = 1.3;        // ufka inmesin (≈75°)

  // Fare: sol tık döndür, tekerlek yakınlaştır, sağ tık kaydır (varsayılan)
  // Parmak: tek parmak döndür, iki parmak sıkıştırarak yakınlaştır ve kaydır
  kontroller.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  // Bakılan nokta kampüs sınırının dışına çıkmasın; kamera da aynı miktar kaydırılır
  const fark = new THREE.Vector3();
  kontroller.addEventListener('change', () => {
    const x = THREE.MathUtils.clamp(kontroller.target.x, 0, IZGARA.genislik);
    const z = THREE.MathUtils.clamp(kontroller.target.z, 0, IZGARA.derinlik);
    fark.set(x - kontroller.target.x, 0, z - kontroller.target.z);
    if (fark.lengthSq() > 0) {
      kontroller.target.add(fark);
      kamera.position.add(fark);
    }
  });

  kontroller.update();
  return kontroller;
}
