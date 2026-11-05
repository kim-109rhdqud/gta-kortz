import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * 선택적 캐릭터 모델 로더.
 * public/models/character.glb 가 있으면 불러와 캡슐 대신 표시한다. 없으면 null.
 * 모델은 발이 원점(0,0,0)에, 정면이 -Z 를 보도록 맞춰져 있어야 한다. 키는 1.8m 로 자동 스케일.
 */
export async function loadCharacter() {
  const url = `${import.meta.env.BASE_URL}models/character.glb`;
  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (!head || !head.ok || !(head.headers.get("content-type") || "").includes("model")) return null;

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  const box = new THREE.Box3().setFromObject(root);
  const h = box.max.y - box.min.y || 1;
  const s = 1.8 / h;
  root.scale.setScalar(s);
  root.position.y = -box.min.y * s;
  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
  });
  root.userData.hasCrouchAnim = (gltf.animations || []).some((a) => /crouch/i.test(a.name));
  root.userData.animations = gltf.animations;
  return root;
}
