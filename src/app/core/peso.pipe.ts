import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 1234.5 → "₱1,234.50"; 129 → "₱129". */
@Pipe({ name: 'peso', standalone: true })
export class PesoPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '₱0';
    const text = formatter.format(value);
    return `₱${/\.\d$/.test(text) ? `${text}0` : text}`;
  }
}
