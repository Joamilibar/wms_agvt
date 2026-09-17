import { classifyDocument, isCompanyRut, rutNumber } from './channel.js';

const rule = {
  projectOffices: ['Bodega Principal San Martin'],
  projectMinUnits: 30,
  companyRutMin: 50_000_000,
  companyRutMax: 100_000_000,
};

describe('channel rule (D1)', () => {
  it('parses RUTs with or without dots and check digit', () => {
    expect(rutNumber('96790240-3')).toBe(96790240);
    expect(rutNumber('76.637.140-k')).toBe(76637140);
    expect(rutNumber('06377788-9')).toBe(6377788);
    expect(rutNumber('555555555')).toBe(555555555);
    expect(rutNumber('')).toBeNull();
    expect(rutNumber(null)).toBeNull();
  });

  it('recognises company RUTs by range', () => {
    expect(isCompanyRut('96790240-3', rule)).toBe(true); // Minera Los Pelambres
    expect(isCompanyRut('06377788-9', rule)).toBe(false); // a person
    expect(isCompanyRut('555555555', rule)).toBe(false); // foreign placeholder
  });

  it('everything invoiced from Bodega Principal is a project, whatever the size', () => {
    expect(classifyDocument({ warehouse: 'Bodega Principal San Martin', customerRut: '76450363-5', docUnits: 5 }, rule)).toBe('project');
  });

  it('a company buying 30 or more units from any office is a project', () => {
    expect(classifyDocument({ warehouse: 'Bodega Virtual Tienda', customerRut: '76450363-5', docUnits: 1500 }, rule)).toBe('project');
    expect(classifyDocument({ warehouse: 'Casa Costanera', customerRut: '76450363-5', docUnits: 30 }, rule)).toBe('project');
  });

  it('a company buying a few units, or a person buying many, stays retail', () => {
    expect(classifyDocument({ warehouse: 'Casa Costanera', customerRut: '76450363-5', docUnits: 4 }, rule)).toBe('retail');
    expect(classifyDocument({ warehouse: 'Showroom Alonso de Cordova', customerRut: '06377788-9', docUnits: 104 }, rule)).toBe('retail');
  });
});
