# 지피로지스 학습용 문서 03
# index_v2.1 운전자 앱 / Firebase 연동 / GPS / 안전사항 기능 완전 해설

이 문서는 `index_v2.1.html`을 중심으로,
운전자 앱의 화면 구성, Firebase 연결, GPS 처리, 안전사항 팝업, 운행일지/송장 업로드까지 전부 해설한다.

---

## 1. 이 파일의 정체

`index_v2.1.html`은 모바일 웹 앱 스타일로 만든 운전자용 화면이다.

핵심 업무는 아래다.

- 차량 로그인
- 차량 가입 신청
- GPS 위치 송신
- 현재 배차 조회
- 상차/하차 근접 판정
- 안전사항 안내
- 운행 완료 처리
- 운행일지 조회
- 송장 이미지 업로드

즉 “운전자가 실제 현장에서 쓰는 화면”의 흐름을 거의 그대로 담고 있다.

---

## 2. HTML 페이지 구조

이 파일은 여러 페이지를 실제 페이지 이동 없이 `page` 클래스로 나눠 관리한다.

### 페이지 목록

- `loginPage`
- `agreementPage`
- `signupPage`
- `safetyPage`
- `mainPage`
- `logPage`

### 전환 방식

```js
window.goToPage = function(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
```

즉 싱글 페이지 앱 비슷하게 동작한다.

---

## 3. 상단 공통 UI 해설

### 3-1. 오프라인 배너

```html
<div id="offlineBanner" class="offline-banner">...</div>
```

역할:
- 네트워크 끊김을 사용자에게 바로 알림

관련 이벤트:

```js
window.addEventListener('online', ...)
window.addEventListener('offline', ...)
```

학습 포인트:
- 브라우저 네트워크 상태 이벤트 활용
- 단순하지만 모바일 UX에 효과적

### 3-2. 로딩 오버레이

`toggleLoading(show, text)`로 제어한다.

역할:
- 로그인/업로드/완료 처리 중 중복 입력 방지

### 3-3. 송장 파일 입력

```html
<input type="file" id="invoiceInput" accept="image/*" capture="environment">
```

여기서 `capture="environment"`는 모바일 카메라 후면 촬영을 유도하는 포인트다.
실무적으로 아주 유용하다.

---

## 4. 로그인/가입 흐름

## 4-1. 로그인 `handleLogin()`

로그인 방식은 Firebase Auth가 아니라 **Firestore vehicles 문서 직접 조회** 방식이다.

### 처리 순서

1. 차량번호 입력
2. `vehicles/{vehicleNumber}` 조회
3. 문서 존재 여부 확인
4. 비밀번호 비교
5. `APPROVED` 상태 확인
6. 통과하면 `curVNum` 저장 후 다음 페이지 이동

### 학습 포인트

간단해서 이해는 쉽지만, 보안적으로는 약하다.

운영환경 개선안:
- Firebase Auth 도입
- 비밀번호 해시 처리
- custom claim 권한 분리

## 4-2. 가입 신청 `handleSignup()`

가입 시 `vehicles` 컬렉션에 아래 정보를 저장한다.

- `vehicleNumber`
- `password`
- `driverName`
- `phone`
- `status: PENDING`
- `registeredAt`
- `lat`, `lng`

즉 가입 완료가 아니라 **승인 대기 상태 등록**이다.

이후 관리자가 승인해야 앱 사용이 가능하다.

---

## 5. 운행 전 점검 페이지의 의미

`safetyPage`는 운행 전 체크리스트 화면이다.

이건 단순 장식이 아니라 꽤 중요한 UX다.

왜냐하면 운전자에게

- 위치 추적이 시작된다
- 안전 운행이 전제된다
- 점검 완료 후 GPS를 켠다

는 흐름을 심리적으로 명확히 보여주기 때문이다.

버튼 `startGPS()`가 사실상 메인 앱 시작 버튼이다.

---

## 6. Firebase 초기화 방식

핵심 코드 흐름:

```js
import { initializeApp } from "firebase-app.js";
import { getFirestore, initializeFirestore, ... } from "firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase-storage.js";

const firebaseConfig = { ... };
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalForceLongPolling: true });
const storage = getStorage(app);
```

### 왜 `initializeFirestore(... longPolling)`를 썼나

모바일 브라우저/일부 네트워크 환경에서 Firestore 실시간 연결 안정성을 높이기 위한 선택으로 보인다.

즉 운전자 앱은 관리자 콘솔보다 네트워크 환경이 불안정할 가능성이 높기 때문에 더 보수적으로 초기화한 것이다.

이건 꽤 현실적인 판단이다.

---

## 7. 전역 상태 변수 해설

주요 상태 변수:

```js
let curVNum = localStorage.getItem('vNum') || '';
let curDispatch = null;
let nextDispatch = null;
let lastLat = 0, lastLng = 0;
let lastUpdate = 0;
let selectedLogId = null;
let wakeLock = null;
let gpsWatchId = null;
let lastGPSUpdate = 0;
let startSiteData = null;
let endSiteData = null;
let shownSafetyNotes = new Set();
```

### 각각의 의미

- `curVNum`: 현재 로그인 차량번호
- `curDispatch`: 현재 수행 중 배차
- `nextDispatch`: 다음 대기 배차
- `lastLat/lng`: 이전 GPS 좌표
- `lastUpdate`: 마지막 DB 업데이트 시점
- `selectedLogId`: 송장 업로드 대상 로그 id
- `wakeLock`: 화면 꺼짐 방지
- `gpsWatchId`: GPS watchPosition 핸들
- `startSiteData/endSiteData`: 상차/하차 현장 상세 데이터
- `shownSafetyNotes`: 이미 띄운 안전 팝업 중복 방지

이 상태 변수만 이해해도 앱 구조의 절반은 잡힌다.

---

## 8. GPS 시작과 위치 추적

핵심 함수는 `startGPS()`다.

### 내부 흐름

1. 버튼 비활성화
2. 메인 페이지 이동
3. 차량번호 표시
4. `listenToDispatch()` 시작
5. Wake Lock 요청
6. `navigator.geolocation.watchPosition()` 시작
7. 10초 또는 50m 이상 변화 시 Firestore 업데이트
8. `checkGeofence()` 실행

### 왜 10초/50m 조건이 중요한가

GPS는 너무 자주 쓰면
- 배터리 소모
- 네트워크 낭비
- Firestore write 비용 증가

가 생긴다.

그래서 이 코드가 무조건 실시간이 아니라 **적당히 제한된 실시간**으로 설계된 건 합리적이다.

---

## 9. GPS 오류 처리 기법

오류 콜백에서 하는 일:

- 콘솔에 에러 기록
- GPS 상태 아이콘 빨강 + 펄스
- 사용자에게 alert
- 3초 후 자동 재시도

### 장점

실외 이동 업무 앱에서는 GPS 오류가 흔하다.
이걸 한 번 에러로 끝내지 않고 자동 재시도하는 건 실무적으로 좋다.

---

## 10. 배차 실시간 수신 `listenToDispatch()`

쿼리 구조:

```js
query(
  collection(db, 'dispatches'),
  where('vehicleNumber', '==', curVNum),
  orderBy('createdAt', 'asc'),
  limit(10)
)
```

### 처리 방식

- Firestore에서 해당 차량 배차만 구독
- `DONE`이 아닌 배차만 active로 본다
- 첫 번째 active를 현재 배차(`curDispatch`)
- 두 번째 active를 다음 배차(`nextDispatch`)

### 좋은 점

운전자 입장에선 “지금 할 일”과 “다음 대기 건”만 보이면 된다.
불필요한 정보를 줄인 UX다.

---

## 11. 메인 운행 화면 구조

메인 카드에는 아래 정보가 보인다.

- 상태 `dispStatus`
- 품목 `dispItem`
- 상차지 `dispStart`
- 하차지 `dispEnd`
- 거리 `distStart`, `distEnd`
- 안전사항 배지 `startSafetyBadge`, `endSafetyBadge`
- 다음 배차 `nextDispatchUI`
- 중량 입력 `weightInput`
- 완료 버튼 `btnComplete`

즉 정보와 액션이 한 화면에 같이 있다.

---

## 12. 배차 렌더링 `renderDispatch()`

이 함수는 배차 1건을 화면에 반영한다.

핵심 처리:

- 상태 한글 매핑
- 품목/상차지/하차지 출력
- 기존 중량 값 복원
- `loadSiteDataForDispatch(d)` 호출

### 왜 `loadSiteDataForDispatch()`가 중요하나

배차 문서만으로는 현장 상세를 충분히 다루기 어렵다.
그래서 다시 `sites` 컬렉션에서 현장 정보를 찾아와,
안전사항 배지 표시와 자동 팝업에 활용한다.

---

## 13. 안전사항 기능의 핵심 구조

이 버전의 핵심 개선 포인트다.

### 13-1. 안전사항 모달 UI

`safetyModal`은 아래 요소를 가진다.

- 제목 `safetyTitle`
- 위치 `safetyLocation`
- 본문 `safetyText`
- 확인 버튼
- 닫기 버튼

### 13-2. 수동 확인 기능

상차/하차 카드에 배지를 붙였다.

```html
<span id="startSafetyBadge" class="safety-badge hidden" onclick="showSafetyNote('start')">
```

안전사항이 있는 현장만 배지가 보인다.

### 13-3. 자동 팝업 기능

`checkGeofence()` 안에서 거리 기반으로 처리한다.

```js
if (distStart <= 0.1 && startSiteData && startSiteData.safetyNotes) {
  const safetyKey = 'start_' + curDispatch.id;
  if (!shownSafetyNotes.has(safetyKey)) {
    shownSafetyNotes.add(safetyKey);
    autoShowSafetyNote('start');
  }
}
```

즉 조건은 3개다.

1. 100m 이내
2. 해당 현장 safetyNotes 존재
3. 아직 안 띄운 배차여야 함

### 13-4. 중복 방지 기법

`shownSafetyNotes`를 `Set`으로 써서

- `start_배차ID`
- `end_배차ID`

형태의 키를 저장한다.

이건 되게 깔끔한 방법이다.

---

## 14. 자동 알림 UX 기법

`autoShowSafetyNote()`는 단순 모달만 띄우지 않는다.

### 같이 하는 것

- 진동
- 비프음
- 모달 표시

```js
navigator.vibrate([200, 100, 200]);
const beep = new Audio('data:audio/wav;base64,...');
beep.play().catch(() => {});
showSafetyNote(type);
```

### 왜 좋은가

현장에서는 화면만 보고 있지 않을 수 있다.
그래서 진동/소리/시각 팝업을 같이 주는 게 맞다.

이건 단순 UI 기능이 아니라 실제 현장 사용성을 고려한 설계다.

---

## 15. 현장 데이터 조회 `loadSiteDataForDispatch()`

이 함수는 `sites` 컬렉션에서 상차지/하차지 정보를 찾는다.

### 처리 흐름

1. `dispatch.startLocation` 기준 현장 조회
2. `dispatch.endLocation` 기준 현장 조회
3. 데이터 있으면 `startSiteData`, `endSiteData`에 저장
4. `safetyNotes` 있으면 배지 표시
5. 없으면 배지 숨김

### 솔직한 구조 평가

지금은 `where('address', '==', dispatch.startLocation)` 같은 방식이어서,
배차 문서의 location 값과 sites의 기준 필드가 정확히 일치해야 한다.

학습용으론 괜찮지만,
실서비스에선 `siteId`를 dispatch에 직접 저장하는 쪽이 더 안전하다.

왜냐하면 문자열 주소/이름 매칭은 오타나 포맷 차이에 약하기 때문이다.

---

## 16. 지오펜스와 상태 전이

`checkGeofence()`는 이 앱의 핵심 비즈니스 로직이다.

### 하는 일 1: 거리 표시

- 상차지 거리 계산
- 하차지 거리 계산
- 각각 km로 표시

### 하는 일 2: 안전사항 팝업

- 상차지 100m 이내면 팝업
- 하차지 100m 이내면 팝업

### 하는 일 3: 완료 버튼 활성화

- 하차지 0.5km 이내면 완료 버튼 활성화

### 하는 일 4: 상태 자동 전이

- `WAITING` + 상차지 접근 → `LOADING`
- `LOADING` + 상차지 이탈 → `MOVING`
- `MOVING` + 하차지 접근 → `UNLOADING`

즉 버튼만 있는 게 아니라 위치 기반 상태 머신처럼 동작한다.

---

## 17. 거리 계산 기법

`getDistance()`는 위경도 간 거리 계산 함수다.

정밀 GIS 수준은 아니지만, 관제/도착 판정용으로는 충분한 방식이다.

학습 포인트:
- 위도/경도 기반 구면거리 계산
- km 단위 반환
- GPS 트래킹, 근접 판정, 버튼 활성화에 재사용

---

## 18. 중량 저장 `saveWeight()`

운전자는 현재 배차에 대해 실중량을 저장할 수 있다.

저장 위치는 `dispatches/{id}` 문서의 `lastWeight` 필드다.

장점:
- 실시간 운행 중에도 중량 기록 가능
- 완료 시 운행일지 생성에 재활용 가능

---

## 19. 운행 완료 `completeDispatch()`

이 함수는 단순히 상태만 DONE으로 바꾸지 않는다.

### 실제 처리 흐름

1. 오늘 날짜 계산(KST 보정)
2. `logs` 컬렉션에 운행일지 추가
3. `dispatches` 상태를 `DONE`으로 변경
4. UI 초기화
5. 송장은 나중에 등록하도록 안내

### 포인트

운행 이력과 현재 배차를 분리 저장하는 구조다.
즉 완료 순간에 **배차 데이터 → 이력 데이터**로 넘어가는 전환점이다.

---

## 20. 운행일지 조회 `loadLogs()`

운전자도 자기 이력을 바로 볼 수 있게 했다.

### 기능

- 날짜 필터
- 송장 미제출만 보기
- 최신순 정렬
- 송장 필요 상태 강조

### UI 포인트

운전자 입장에서는 정산 가능 여부가 중요하니까,
송장 제출 여부를 강하게 보여주는 게 맞다.

---

## 21. 송장 업로드와 Firebase Storage 연동

이 부분이 Firebase 연동 공부에 특히 좋다.

### 흐름

1. 사용자가 사진 선택/촬영
2. `compressImage(file)`로 압축
3. Storage 경로 생성
4. `uploadBytes()` 업로드
5. `getDownloadURL()`로 공개 URL 획득
6. 해당 `logs` 문서의 `invoiceUrl` 업데이트

### 왜 압축이 중요한가

모바일 현장 사진은 원본 용량이 크다.
압축 없이 올리면
- 업로드 느림
- 데이터 소모 큼
- 스토리지 비용 증가

그래서 업로드 전 canvas 기반 압축을 넣은 건 좋다.

---

## 22. 이 파일에서 배울 수 있는 Firebase 기법 총정리

### Firestore 읽기

- `getDoc()` : 단건 조회(로그인 시 차량 문서)
- `getDocs()` : 다건 조회(현장 정보 조회)
- `onSnapshot()` : 실시간 구독(배차, 로그)

### Firestore 쓰기

- `setDoc()` : 신규 차량 가입/문서 지정 저장
- `addDoc()` : 운행일지 생성
- `updateDoc()` : GPS 위치, 상태, 중량, 송장 URL 갱신

### Storage

- `ref()` : 업로드 경로 생성
- `uploadBytes()` : 이미지 업로드
- `getDownloadURL()` : 파일 URL 반환

즉 이 한 파일 안에 Firebase 주요 기초 기능이 거의 다 들어 있다.

---

## 23. 이 파일에서 배울 수 있는 모바일 웹 기법

- full-screen page 설계
- safe area 대응
- 진동 API 사용
- 파일 capture 속성 사용
- Wake Lock 사용
- 오프라인 감지
- GPS watchPosition 사용
- 버튼 활성/비활성 상태 설계

이건 그냥 웹페이지 수준이 아니라 **현장형 모바일 웹 앱 패턴**이다.

---

## 24. 구조적으로 아쉬운 점도 같이 보자

공부할 때는 좋은 점만 보면 안 된다.

### 1. 인증 구조가 약함

비밀번호를 Firestore 문서와 비교하는 방식은 운영용으론 약하다.

### 2. site 조회 기준이 문자열 의존

현장명을 바꾸거나 주소 포맷이 다르면 매칭 깨질 수 있다.

### 3. 단일 파일 규모가 큼

UI/비즈니스/스토리지/위치 처리까지 한 파일에 몰려 있다.

### 4. alert 중심 UX

현장 앱이긴 하지만 toast/snackbar형이 더 좋다.

### 5. 상태 전이 로직이 코드 분리 안 됨

상태 머신을 함수나 객체로 별도 분리하면 더 읽기 쉬웠을 것이다.

하지만 학습 단계에서는 오히려 지금 코드가 눈으로 따라가기 쉽다.

---

## 25. 실무적으로 더 좋게 바꾸려면

### 개선안 1
배차 문서에 `startSiteId`, `endSiteId` 저장

### 개선안 2
Firebase Auth로 로그인 구조 변경

### 개선안 3
Storage 업로드 파일명에 로그 id 포함

### 개선안 4
안전사항 확인 여부를 dispatch 문서에 기록

### 개선안 5
푸시 알림(Firebase Cloud Messaging)까지 붙이기

---

## 26. 이 파일을 공부하는 추천 순서

### 1단계
페이지 구조와 id 먼저 훑기

### 2단계
Firebase 초기화 읽기

### 3단계
로그인/가입 함수 읽기

### 4단계
GPS 시작 함수 읽기

### 5단계
`listenToDispatch()`와 `renderDispatch()` 읽기

### 6단계
`checkGeofence()`를 정독하기

### 7단계
송장 업로드 흐름 읽기

이 순서가 제일 덜 헷갈린다.

---

## 27. 최종 총평

`index_v2.1.html`은

**“프론트엔드 한 파일로 모바일 운전자 앱을 만들면서 Firebase, GPS, Storage, 안전 알림까지 묶는 방법”**

을 꽤 현실적으로 보여주는 예제다.

완벽하게 세련된 구조는 아니지만,
공부하기에는 오히려 장점이 있다.

왜냐하면 로직이 숨겨져 있지 않고,
실제 동작 흐름이 코드에 거의 그대로 드러나 있기 때문이다.

그래서 이 파일은

- Firebase 입문자
- 위치 기반 앱을 만들고 싶은 사람
- 관리자/현장용 시스템을 같이 배우고 싶은 사람

에게 꽤 좋은 실전형 학습 자료가 된다.
