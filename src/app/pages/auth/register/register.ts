
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '../../../firebase';

@Component({
  selector: 'app-register',
  imports: [FormsModule],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {

  email: string = '';
  password: string = '';
  confirmPassword: string = '';

  errorMessage: string = '';
  successMessage: string = '';
  isSubmitting: boolean = false;

  async registerUser() {

    this.errorMessage = '';
    this.successMessage = '';

    if (!this.email || !this.password || !this.confirmPassword) {
      this.errorMessage = 'Please fill in all fields.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    this.isSubmitting = true;

    try {
      await createUserWithEmailAndPassword(
        auth,
        this.email.trim(),
        this.password
      );

      this.successMessage = 'Account created successfully!';

    } catch (error) {

      if (error instanceof FirebaseError) {
        if (error.code === 'auth/email-already-in-use') {
          this.errorMessage = 'This email is already registered.';
        } else if (error.code === 'auth/weak-password') {
          this.errorMessage = 'Please choose a stronger password.';
        } else if (error.code === 'auth/invalid-email') {
          this.errorMessage = 'Please enter a valid email.';
        } else {
          this.errorMessage = 'Registration failed. Please try again.';
        }
      } else {
        this.errorMessage = 'Something went wrong.';
      }

    } finally {
      this.isSubmitting = false;
    }
  }
}
