
import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  signal,
  computed
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';

import {
  map as createMap,
  tileLayer,
  circleMarker,
  layerGroup,
  Map as LeafletMap,
  LayerGroup
} from 'leaflet';

import { auth, db } from '../../../firebase';

// Report information displayed on the admin map.
interface MappedReport {
  id: string;
  residentId: string;
  latitude: number;
  longitude: number;
  problemType: string;
  description: string;
  status: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

@Component({
  selector: 'app-map',
  imports: [DatePipe, RouterLink],
  templateUrl: './map.html',
  styleUrl: './map.css',
})
export class Map implements AfterViewInit, OnDestroy {

  // Reference to the HTML map container.
  @ViewChild('mapContainer')
  mapContainer!: ElementRef<HTMLDivElement>;

  // Leaflet instances.
  private leafletMap: LeafletMap | null = null;
  private reportMarkers: LayerGroup | null = null;

  // Firestore listener.
  private unsubscribeReports: Unsubscribe | null = null;

  private destroyed = false;

  // Map information.
  readonly mappedReports = signal<MappedReport[]>([]);
  readonly totalReports = signal(0);

  // Selected report.
  readonly selectedReportId = signal<string | null>(null);

  readonly selectedReport = computed(() => {

    const selectedId = this.selectedReportId();

    return this.mappedReports().find(
      report => report.id === selectedId
    ) ?? null;

  });

  // Loading and error states.
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  // Default location:
  // Tagoloan, Misamis Oriental, Philippines.
  private readonly defaultLatitude = 8.5391;
  private readonly defaultLongitude = 124.7538;

  ngAfterViewInit(): void {

    // Initialize the map.
    this.initializeMap();

    // Load all community report locations.
    void this.loadAllReportMarkers();

  }

  private initializeMap(): void {

    // Prevent duplicate map initialization.
    if (this.leafletMap) {
      return;
    }

    // Create Leaflet map.
    this.leafletMap = createMap(
      this.mapContainer.nativeElement,
      {
        center: [
          this.defaultLatitude,
          this.defaultLongitude
        ],
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: true
      }
    );

    // Add OpenStreetMap map tiles.
    tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    ).addTo(this.leafletMap);

    // Separate layer for Firestore report markers.
    this.reportMarkers = layerGroup().addTo(
      this.leafletMap
    );

    console.log(
      'BahaSumbong Administrator Map initialized.'
    );

  }

  // Retrieve community reports from Firestore.
  private async loadAllReportMarkers(): Promise<void> {

    try {

      // Wait for Firebase Authentication.
      await auth.authStateReady();

      if (this.destroyed) {
        return;
      }

      const currentUser = auth.currentUser;

      if (!currentUser) {

        this.errorMessage.set(
          'Please sign in as an administrator.'
        );

        this.isLoading.set(false);
        return;
      }

      // Verify the administrator's Firestore profile.
      const adminRef = doc(
        db,
        'users',
        currentUser.uid
      );

      const adminSnap = await getDocFromServer(adminRef);

      if (this.destroyed) {
        return;
      }

      if (!adminSnap.exists()) {

        this.errorMessage.set(
          'Administrator account not found.'
        );

        this.isLoading.set(false);
        return;
      }

      const adminData = adminSnap.data();

      // Verify administrator role.
      if (
        adminData['role'] !== 'admin' ||
        adminData['uid'] !== currentUser.uid
      ) {

        this.errorMessage.set(
          'You do not have permission to view the Administrator Map.'
        );

        this.isLoading.set(false);
        return;
      }

      // Administrators may retrieve all community reports.
      // Firestore security rules independently enforce this.
      const reportsRef = collection(
        db,
        'reports'
      );

      // Real-time listener for all reports.
      this.unsubscribeReports = onSnapshot(

        reportsRef,

        (snapshot) => {

          if (this.destroyed || !this.reportMarkers) {
            return;
          }

          const markersLayer = this.reportMarkers;

          // Clear previously displayed markers.
          markersLayer.clearLayers();

          // Count all reports, including older reports.
          this.totalReports.set(snapshot.size);

          const validReports: MappedReport[] = [];

          for (const reportDoc of snapshot.docs) {

            const data = reportDoc.data();

            const latitude = data['latitude'];
            const longitude = data['longitude'];

            // Skip reports without valid coordinates.
            if (
              typeof latitude !== 'number' ||
              typeof longitude !== 'number' ||
              !Number.isFinite(latitude) ||
              !Number.isFinite(longitude) ||
              latitude < -90 ||
              latitude > 90 ||
              longitude < -180 ||
              longitude > 180
            ) {
              continue;
            }

            const createdAt = data['createdAt'];
            const updatedAt = data['updatedAt'];

            // Create report information.
            const report: MappedReport = {

              id: reportDoc.id,

              residentId:
                data['residentId'] || '',

              latitude: latitude,
              longitude: longitude,

              problemType:
                data['problemType'] || 'unknown',

              description:
                data['description'] || '',

              status:
                data['status'] || 'unknown',

              createdAt:
                createdAt instanceof Timestamp
                  ? createdAt.toDate()
                  : null,

              updatedAt:
                updatedAt instanceof Timestamp
                  ? updatedAt.toDate()
                  : null

            };

            validReports.push(report);

            // Orange marker represents a submitted report.
            const marker = circleMarker(
              [latitude, longitude],
              {
                radius: 10,
                color: '#A84C00',
                weight: 2,
                fillColor: '#F59E0B',
                fillOpacity: 0.9,
                bubblingMouseEvents: false
              }
            );

            // Use static popup text.
            marker.bindPopup(
              'Submitted community report'
            );

            // Select a report when the marker is clicked.
            marker.on('click', () => {

              this.selectedReportId.set(report.id);

            });

            // Add the marker to the map.
            marker.addTo(markersLayer);

          }

          // Update all mapped reports.
          this.mappedReports.set(validReports);

          // Clear selection if its report no longer exists.
          const selectedId = this.selectedReportId();

          if (
            selectedId &&
            !validReports.some(
              report => report.id === selectedId
            )
          ) {

            this.selectedReportId.set(null);

          }

          this.errorMessage.set('');
          this.isLoading.set(false);

        },

        (error) => {

          if (this.destroyed) {
            return;
          }

          console.error(
            'Error retrieving administrator map reports:',
            error
          );

          this.mappedReports.set([]);
          this.reportMarkers?.clearLayers();
          this.selectedReportId.set(null);

          if (error.code === 'permission-denied') {

            this.errorMessage.set(
              'Permission denied. Administrator access is required.'
            );

          } else {

            this.errorMessage.set(
              'Unable to load report markers. Please check your connection.'
            );

          }

          this.isLoading.set(false);

        }

      );

    } catch (error) {

      console.error(
        'Error initializing Administrator Map:',
        error
      );

      if (!this.destroyed) {

        this.errorMessage.set(
          'Something went wrong while loading the Administrator Map.'
        );

        this.isLoading.set(false);

      }

    }

  }

  // Clear the currently selected report.
  clearSelectedReport(): void {

    this.selectedReportId.set(null);

  }

  ngOnDestroy(): void {

    this.destroyed = true;

    // Stop Firestore listener.
    this.unsubscribeReports?.();

    // Remove report markers.
    if (this.reportMarkers) {

      this.reportMarkers.clearLayers();
      this.reportMarkers = null;

    }

    // Destroy the Leaflet map.
    if (this.leafletMap) {

      this.leafletMap.remove();
      this.leafletMap = null;

    }

  }

}
