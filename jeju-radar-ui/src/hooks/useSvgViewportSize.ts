import {
  useEffect,
  useRef,
  useState
} from "react";

export function useSvgViewportSize() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    function updateSvgSize() {
      const bounds = svgRef.current?.getBoundingClientRect();

      if (!bounds) {
        return;
      }

      setSvgSize({
        width: bounds.width,
        height: bounds.height
      });
    }

    updateSvgSize();
    window.addEventListener("resize", updateSvgSize);

    const resizeObserver = new ResizeObserver(updateSvgSize);

    if (svgRef.current) {
      resizeObserver.observe(svgRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateSvgSize);
      resizeObserver.disconnect();
    };
  }, []);

  return {
    svgRef,
    svgSize
  };
}
