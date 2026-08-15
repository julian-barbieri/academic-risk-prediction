jest.mock('../db/database', () => ({
  prepare: jest.fn(() => ({
    get: jest.fn(() => null),
    all: jest.fn(() => []),
  })),
}));

const {
  normalizeAlumnoPayload,
  normalizeMateriaPayload,
  normalizeExamenPayload,
} = require('./panel-predicciones.service');

describe('normalizeAlumnoPayload', () => {
  test('castea solo los 7 campos del modelo alumno', () => {
    const input = [{
      PromedioNotaGeneral: '5.5',
      PromedioAsistencia: '0.8',
      AyudaFinanciera: '1',
      CantExamenesRendidos: '10',
      CantFinalesRendidos: '3',
      IndiceBloqueoPromedio: '0.25',
      DelayPromedioRespectoPlan: '1.5',
      campoExtra: 99,
    }];
    const result = normalizeAlumnoPayload(input);
    expect(result[0]).toStrictEqual({
      PromedioNotaGeneral: 5.5,
      PromedioAsistencia: 0.8,
      AyudaFinanciera: 1,
      CantExamenesRendidos: 10,
      CantFinalesRendidos: 3,
      IndiceBloqueoPromedio: 0.25,
      DelayPromedioRespectoPlan: 1.5,
    });
  });

  test('no incluye campos extra', () => {
    const result = normalizeAlumnoPayload([{
      PromedioNotaGeneral: 5, PromedioAsistencia: 0.7,
      AyudaFinanciera: 0, CantExamenesRendidos: 5, CantFinalesRendidos: 1,
      IndiceBloqueoPromedio: 0.1, DelayPromedioRespectoPlan: 0.5,
    }]);
    expect(Object.keys(result[0])).toHaveLength(7);
  });
});

describe('normalizeMateriaPayload', () => {
  test('castea solo los 9 campos del modelo materia', () => {
    const input = [{
      PromedioNotaGeneral: '6',
      PromedioAsistencia: '0.9',
      AyudaFinanciera: '0',
      Materia: '145',
      PromedioColegio: '7.5',
      IndiceBloqueo: '0.3',
      DelayRespectoPlan: '1',
      NotaPromedioPrevias: '6.8',
      EsMateriaBottleneck: '1',
      campoExtra: 'x',
    }];
    const result = normalizeMateriaPayload(input);
    expect(result[0]).toStrictEqual({
      PromedioNotaGeneral: 6,
      PromedioAsistencia: 0.9,
      AyudaFinanciera: 0,
      Materia: 145,
      PromedioColegio: 7.5,
      IndiceBloqueo: 0.3,
      DelayRespectoPlan: 1,
      NotaPromedioPrevias: 6.8,
      EsMateriaBottleneck: 1,
    });
  });

  test('no incluye campos extra', () => {
    const result = normalizeMateriaPayload([{
      PromedioNotaGeneral: 6, PromedioAsistencia: 0.9,
      AyudaFinanciera: 0, Materia: 145, PromedioColegio: 7,
      IndiceBloqueo: 0.3, DelayRespectoPlan: 1,
      NotaPromedioPrevias: 6.8, EsMateriaBottleneck: 1,
    }]);
    expect(Object.keys(result[0])).toHaveLength(9);
  });
});

describe('normalizeExamenPayload', () => {
  test('castea solo los 9 campos del modelo examen', () => {
    const input = [{
      PromedioNotaGeneral: '5',
      PromedioAsistencia: '0.75',
      AyudaFinanciera: '1',
      NotaPromedioParcialCursada: '6.5',
      TasaRecursaGeneral: '0.2',
      Materia: '152',
      NotaPromedioCorrelativas: '6.2',
      IndiceBloqueo: '0.4',
      CargaSimultanea: '3',
      TipoExamen: 'Final',
      PosicionFlujo: '5',
      Instancia: '1',
    }];
    const result = normalizeExamenPayload(input);
    expect(result[0]).toStrictEqual({
      PromedioNotaGeneral: 5,
      PromedioAsistencia: 0.75,
      AyudaFinanciera: 1,
      NotaPromedioParcialCursada: 6.5,
      TasaRecursaGeneral: 0.2,
      Materia: 152,
      NotaPromedioCorrelativas: 6.2,
      IndiceBloqueo: 0.4,
      CargaSimultanea: 3,
    });
  });

  test('no incluye TipoExamen, PosicionFlujo ni otros campos viejos', () => {
    const result = normalizeExamenPayload([{
      PromedioNotaGeneral: 5, PromedioAsistencia: 0.75,
      AyudaFinanciera: 1, NotaPromedioParcialCursada: 6.5,
      TasaRecursaGeneral: 0.2, Materia: 152,
      NotaPromedioCorrelativas: 6.2, IndiceBloqueo: 0.4, CargaSimultanea: 3,
      TipoExamen: 'Final', PosicionFlujo: 5,
    }]);
    expect(result[0]).not.toHaveProperty('TipoExamen');
    expect(result[0]).not.toHaveProperty('PosicionFlujo');
    expect(Object.keys(result[0])).toHaveLength(9);
  });
});
