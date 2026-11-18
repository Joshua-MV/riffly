import kit from '../../../../brand/colors.json';
import { brand, darkColors, lightColors } from '../tokens';

/** brand/colors.json is generated from tokens.ts; if this fails, run `npm.cmd run brand`. */
describe('brand kit', () => {
  it('matches the app colours', () => {
    expect(kit.brand).toEqual(brand);
    expect(kit.dark).toEqual(darkColors);
    expect(kit.light).toEqual(lightColors);
  });
});
