import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForward, checkmarkDone } from 'ionicons/icons';

addIcons({ 'chevron-forward': chevronForward, 'checkmark-done': checkmarkDone });

interface Slide {
  image: string;
  title: string;
  text: string;
}

@Component({
  selector: 'app-onboarding',
  standalone: true,
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  imports: [CommonModule, IonContent, IonButton, IonIcon],
})
export class OnboardingPage {
  activeIndex = 0;

  slides: Slide[] = [
    {
      image: 'assets/logo/tearush-logo-placeholder.svg',
      title: 'Welcome to TeaRush',
      text: 'Your favorite milk tea, brewed fresh and delivered anytime, anywhere.',
    },
    {
      image: 'assets/logo/onboarding-customize-placeholder.svg',
      title: 'Customize your perfect cup',
      text: 'Pick your sweetness, ice level, and toppings — every drink, made exactly your way.',
    },
    {
      image: 'assets/logo/onboarding-promo-placeholder.svg',
      title: 'Exclusive promos, just for you',
      text: 'Unlock rewards, vouchers, and limited-time offers every time you order.',
    },
  ];

  constructor(private router: Router) {}

  get isLastSlide(): boolean {
    return this.activeIndex === this.slides.length - 1;
  }

  next(): void {
    if (this.isLastSlide) {
      this.finish();
      return;
    }
    this.activeIndex++;
  }

  skip(): void {
    this.finish();
  }

  goTo(index: number): void {
    this.activeIndex = index;
  }

  private finish(): void {
    this.router.navigateByUrl('/dashboard', { replaceUrl: true });
  }
}

