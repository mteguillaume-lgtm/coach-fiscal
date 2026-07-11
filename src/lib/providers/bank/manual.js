// Source « saisie manuelle » : lit le store patrimoine → Position[].
import { listManual } from '../../patrimoine/manualStore';

export const id = 'manual';
export const getPositions = (storage = localStorage) => listManual(storage);
