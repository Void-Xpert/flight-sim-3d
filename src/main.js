import './style.css';
import * as THREE from 'three';

const app = document.querySelector('#app');
app.innerHTML = `
  <div id="map"></div>
  <div id="hud">
    <div id="title">Skyline Strike</div>
    <div id="mission">Mission loading...</div>
    <div id="status">Preparing live map overlay...</div>
    <div id="controls">W/A/S/D or arrows to steer • Shift boost • Space fire</div>
  </div>
`;

const MAP_CENTER = { lat: 40.7580, lng: -73.9855 };
const TARGET = { lat: MAP_CENTER.lat + 0.0028, lng: MAP_CENTER.lng + 0.0012 };

const state = {
  speed: 0.3,
  turn: 0,
  pitch: 0,
  altitude: 30,
  health: 100,
  ammo: 60,
  mission: 'Patrol the Midtown skyline',
};

const keys = {};
const maybeMap = document.getElementById('map');

const darkMapStyle = [
  { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#1d2433' }] },
  { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ color: '#d9e4ff' }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ color: '#112035' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d3b52' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1f2d' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#16253a' }] },
];

function showMissingKeyWarning() {
  const mapNode = document.getElementById('map');
  mapNode.innerHTML = `
    <div class="fallback-panel">
      <h2>Google Maps API key required</h2>
      <p>Create a <strong>.env.local</strong> file with:</p>
      <pre>VITE_GOOGLE_MAPS_API_KEY=your_key_here</pre>
      <p>Then restart the dev server and re-open this page.</p>
    </div>
  `;

  const hud = document.getElementById('status');
  hud.textContent = 'API key missing';
}

function latLngToWorld(lat, lng, center) {
  const metersLat = (lat - center.lat) * 111_000;
  const metersLng = (lng - center.lng) * 111_000 * Math.cos((center.lat * Math.PI) / 180);
  return { x: metersLng, z: metersLat };
}

function createPlane() {
  const plane = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x66d9ff,
    metalness: 0.7,
    roughness: 0.35,
    emissive: 0x0d243d,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xe6f7ff,
    metalness: 0.9,
    roughness: 0.2,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 3.2, 8, 18), bodyMaterial);
  body.rotation.z = Math.PI / 2;
  plane.add(body);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.65, 18, 18), accentMaterial);
  cockpit.scale.set(1.35, 0.9, 0.9);
  cockpit.position.set(0.6, 0.2, 0);
  plane.add(cockpit);

  const leftWing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.9), accentMaterial);
  leftWing.position.set(-1.1, -0.1, 0);
  plane.add(leftWing);

  const rightWing = leftWing.clone();
  rightWing.position.x = 1.1;
  plane.add(rightWing);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), bodyMaterial);
  tail.position.set(-2.1, 0.3, 0);
  plane.add(tail);

  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 16), accentMaterial);
  engine.rotation.z = Math.PI / 2;
  engine.position.set(-0.8, -0.15, 0);
  plane.add(engine);

  plane.position.set(0, 28, 0);
  plane.rotation.order = 'YXZ';
  return plane;
}

function createTargetMarker() {
  const marker = new THREE.Group();
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0xff5c8a,
    emissive: 0x5b0b2d,
    side: THREE.DoubleSide,
  });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 18, 64), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  marker.add(ring);

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 20), new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0x513d00,
  }));
  core.position.y = 0.8;
  marker.add(core);

  return marker;
}

function buildCity(center, buildCount) {
  const city = new THREE.Group();
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x0b1f32,
    metalness: 0.3,
    roughness: 0.8,
  });

  for (let i = 0; i < buildCount; i += 1) {
    const offsetLat = (Math.random() - 0.5) * 0.012;
    const offsetLng = (Math.random() - 0.5) * 0.012;
    const world = latLngToWorld(center.lat + offsetLat, center.lng + offsetLng, center);
    const height = 15 + Math.random() * 110;
    const width = 7 + Math.random() * 10;
    const depth = 7 + Math.random() * 10;

    const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), baseMaterial);
    building.position.set(world.x, height / 2, world.z);
    city.add(building);
  }

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(250, 128),
    new THREE.MeshStandardMaterial({ color: 0x1c2e27, roughness: 0.9, metalness: 0.2 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  city.add(ground);

  return city;
}

function createMissionText() {
  const missions = [
    'Escort the convoy over Midtown',
    'Sweep the skyline for hostile drones',
    'Track the radar beacon near the river',
    'Defend the tower corridor',
  ];

  const nextIndex = Math.floor(Math.random() * missions.length);
  return missions[nextIndex];
}

async function initMapExperience() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    showMissingKeyWarning();
    return;
  }

  const { Loader } = await import('@googlemaps/js-api-loader');
  const loader = new Loader({
    apiKey,
    version: 'weekly',
    libraries: ['geometry'],
  });

  await loader.load();

  const map = new google.maps.Map(document.getElementById('map'), {
    center: MAP_CENTER,
    zoom: 17,
    minZoom: 15,
    maxZoom: 20,
    disableDefaultUI: true,
    zoomControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'demo-map',
    styles: darkMapStyle,
    gestureHandling: 'greedy',
  });

  const mapContainer = document.getElementById('map');
  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'game-overlay';
  mapContainer.appendChild(overlayContainer);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  overlayContainer.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050b15, 80, 350);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1500);
  const ambient = new THREE.HemisphereLight(0xaecbff, 0x0d1726, 1.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff6cc, 1.2);
  sun.position.set(60, 80, 30);
  scene.add(sun);

  const plane = createPlane();
  scene.add(plane);

  const target = createTargetMarker();
  const targetWorld = latLngToWorld(TARGET.lat, TARGET.lng, MAP_CENTER);
  target.position.set(targetWorld.x, 8, targetWorld.z);
  scene.add(target);

  const city = buildCity(MAP_CENTER, 26);
  scene.add(city);

  state.mission = createMissionText();
  const missionNode = document.getElementById('mission');
  const statusNode = document.getElementById('status');
  missionNode.textContent = `Mission: ${state.mission}`;
  statusNode.textContent = 'Real map synced';

  window.addEventListener('keydown', (event) => {
    keys[event.key.toLowerCase()] = true;
    if (event.code === 'Space') {
      state.ammo = Math.max(0, state.ammo - 1);
      if (state.ammo === 0) {
        statusNode.textContent = 'Weapon coolant cycle';
      }
    }
  });

  window.addEventListener('keyup', (event) => {
    keys[event.key.toLowerCase()] = false;
  });

  const clock = new THREE.Clock();

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.033);
    const turnInput = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    const pitchInput = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    const boost = keys.shift ? 1.8 : 1.0;

    state.turn += turnInput * 0.9 * dt;
    state.pitch += pitchInput * 0.7 * dt;
    state.turn *= 0.92;
    state.pitch *= 0.9;

    plane.rotation.y = state.turn * 1.3;
    plane.rotation.x = -state.pitch * 0.7;
    plane.rotation.z = state.turn * 0.45;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(plane.quaternion);
    state.speed = THREE.MathUtils.clamp(state.speed + (keys.shift ? 0.2 : -0.05) * dt, 0.15, 1.35);
    plane.position.addScaledVector(forward, state.speed * boost * 12 * dt);
    plane.position.y = THREE.MathUtils.clamp(plane.position.y + state.pitch * 8 * dt + 0.18, 16, 120);

    const cameraTarget = plane.position.clone().add(new THREE.Vector3(0, 5, 20).applyQuaternion(plane.quaternion));
    camera.position.lerp(cameraTarget.clone().multiplyScalar(0.85), 0.08);
    camera.lookAt(plane.position.clone().add(new THREE.Vector3(0, 2, 0)));

    const targetWorld = latLngToWorld(TARGET.lat, TARGET.lng, MAP_CENTER);
    target.position.set(targetWorld.x, 8 + Math.sin(performance.now() * 0.004) * 2, targetWorld.z);

    const planeWorld = plane.position.clone();
    const distanceToTarget = planeWorld.distanceTo(target.position);
    if (distanceToTarget < 12) {
      state.health = Math.min(100, state.health + 8);
      missionNode.textContent = 'Mission cleared: radar beacon destroyed';
      statusNode.textContent = 'Target neutralized';
    } else {
      state.health = Math.max(0, state.health - 0.015);
      missionNode.textContent = `Mission: ${state.mission}`;
      statusNode.textContent = `Integrity ${Math.round(state.health)}%`;
    }

    if (state.health <= 0) {
      state.health = 100;
      plane.position.set(0, 40, 0);
      statusNode.textContent = 'Systems restored';
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
}

initMapExperience();

window.addEventListener('load', () => {
  if (maybeMap) {
    maybeMap.setAttribute('aria-label', 'Google Maps flight sim');
  }
});
