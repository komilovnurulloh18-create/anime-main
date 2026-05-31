const createDots = (dotsEl, count) => {
  if (!dotsEl) return;
  dotsEl.innerHTML = Array.from({ length: count })
    .map((_, index) => `<span class="dot${index === 0 ? ' active' : ''}"></span>`)
    .join('');
};

const setActiveDot = (dotsEl, index) => {
  if (!dotsEl) return;
  dotsEl.querySelectorAll('.dot').forEach((dot, idx) => {
    dot.classList.toggle('active', idx === index);
  });
};

export const initAutoCarousel = (trackSelector, dotsSelector, speed = 18) => {
  const resolveElement = (value) =>
    typeof value === 'string' ? document.querySelector(value) : value;

  const track = resolveElement(trackSelector);
  const dots = resolveElement(dotsSelector);
  if (!track) return;

  const slides = Array.from(track.children);
  if (!slides.length) return;

  createDots(dots, slides.length);

  let index = 0;
  let isDragging = false;
  let startX = 0;
  let startScroll = 0;
  let activePointerId = null;

  const updateActiveDot = () => {
    const nearestIndex = slides.reduce(
      (closest, slide, idx) => {
        const distance = Math.abs(track.scrollLeft - slide.offsetLeft);
        if (distance < closest.distance) {
          return { index: idx, distance };
        }
        return closest;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY }
    );

    index = nearestIndex.index;
    setActiveDot(dots, index);
  };

  const scrollToIndex = (nextIndex) => {
    const normalizedIndex = ((nextIndex % slides.length) + slides.length) % slides.length;
    const slide = slides[normalizedIndex];
    if (!slide) return;

    index = normalizedIndex;
    const offset = slide.offsetLeft - track.offsetLeft;

    track.scrollTo({
      left: offset,
      behavior: 'smooth',
    });

    setActiveDot(dots, index);
  };

  track.addEventListener('pointerdown', (event) => {
    isDragging = true;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startScroll = track.scrollLeft;

    if (track.setPointerCapture) {
      track.setPointerCapture(event.pointerId);
    }
  });

  track.addEventListener('pointermove', (event) => {
    if (!isDragging) return;
    if (activePointerId !== event.pointerId) return;

    const walk = (event.clientX - startX) * 1.2;
    track.scrollLeft = startScroll - walk;
  });

  const endDrag = (event) => {
    if (!isDragging) return;
    if (event && activePointerId !== null && event.pointerId !== activePointerId) return;

    isDragging = false;

    if (event && track.releasePointerCapture) {
      try {
        track.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }

    activePointerId = null;
    updateActiveDot();
    scrollToIndex(index);
  };

  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  track.addEventListener('lostpointercapture', () => {
    if (!isDragging) return;
    isDragging = false;
    activePointerId = null;
    updateActiveDot();
    scrollToIndex(index);
  });

  track.addEventListener('scroll', updateActiveDot);

  if (dots) {
    dots.addEventListener('click', (event) => {
      const clickedDot = event.target.closest('.dot');
      if (!clickedDot) return;

      const dotList = [...dots.querySelectorAll('.dot')];
      const clickedIndex = dotList.indexOf(clickedDot);
      if (clickedIndex >= 0) {
        scrollToIndex(clickedIndex);
      }
    });
  }

  scrollToIndex(0);
};