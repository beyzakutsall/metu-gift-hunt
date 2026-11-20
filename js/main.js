// Sahneyi kurar, kampüs verisini yükler ve modülleri birbirine bağlar
import * as THREE from 'three';
import { enlemBoylamdanBloga } from './projeksiyon.js';
import { zeminIzgarasiOlustur } from './dunya.js';
import { zeminDokulariniOlustur, binaDokulariniOlustur } from './dokular.js';
import { zeminOlustur } from './zemin.js';
import { binaIzgarasiOlustur, binalariOlustur } from './binalar.js';
import { agaclariOlustur } from './agaclar.js';
import { kameraKontrolleriniKur } from './kamera.js';

const GOK_RENGI = 0x8ec8ff;
const BASLANGIC = { enlem: 39.8915, boylam: 32.7835 }; // Devrim Stadı / Kütüphane civarı

const yukleniyor = document.getElementById('yukleniyor');

async function baslat() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const sahne = new THREE.Scene();
  sahne.background = new THREE.Color(GOK_RENGI);

  const kamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 4000);

  const yanit = await fetch('data/campus.json');
  if (!yanit.ok) throw new Error(`data/campus.json okunamadı (HTTP ${yanit.status})`);
  const osm = await yanit.json();

  const anizotropi = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const izgara = zeminIzgarasiOlustur(osm);
  sahne.add(zeminOlustur(izgara, zeminDokulariniOlustur(anizotropi), GOK_RENGI));

  const binaIzgarasi = binaIzgarasiOlustur(osm);
  const binalar = binalariOlustur(binaIzgarasi, binaDokulariniOlustur(anizotropi), GOK_RENGI);
  sahne.add(binalar);
  console.info(`Binalar: ${binaIzgarasi.binaSayisi} bina, ${binalar.userData.dortgenSayisi} dörtgen`);

  const agaclar = await agaclariOlustur(izgara, binaIzgarasi, GOK_RENGI);
  sahne.add(agaclar);

  const baslangic = enlemBoylamdanBloga(BASLANGIC.enlem, BASLANGIC.boylam);
  const kontroller = kameraKontrolleriniKur(kamera, renderer.domElement,
    new THREE.Vector3(baslangic.x, 0, baslangic.z));

  window.addEventListener('resize', () => {
    kamera.aspect = window.innerWidth / window.innerHeight;
    kamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  yukleniyor.hidden = true;

  renderer.setAnimationLoop((zamanMs) => {
    agaclar.userData.guncelle(zamanMs / 1000); // ışıkların yanıp sönmesi
    kontroller.update();
    renderer.render(sahne, kamera);
  });
}

baslat().catch(hata => {
  console.error(hata);
  // file:// ile açıldığında fetch çalışmaz; en sık hata bu
  yukleniyor.textContent = location.protocol === 'file:'
    ? 'Sayfa yerel bir sunucu üzerinden açılmalı (README\'ye bakın).'
    : 'Harita yüklenemedi: ' + hata.message;
});
