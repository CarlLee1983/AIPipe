import "../../test-setup";
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdventurerSvg, PortraitMasterSvg } from "../../src/assets/svg-fallbacks";

test("AdventurerSvg 依 variant 輸出 SVG", () => {
  const a = renderToStaticMarkup(<AdventurerSvg variant={0} />);
  const b = renderToStaticMarkup(<AdventurerSvg variant={1} />);
  expect(a).toContain("<svg");
  expect(b).toContain("<svg");
  expect(a).not.toBe(b);
});

test("PortraitMasterSvg 輸出 bust SVG", () => {
  const html = renderToStaticMarkup(<PortraitMasterSvg />);
  expect(html).toContain('viewBox="0 0 48 48"');
});
