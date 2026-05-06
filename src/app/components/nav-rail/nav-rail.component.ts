import { ChangeDetectionStrategy, Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IconComponent } from "../icon/icon.component";

/**
 * Vertical NavRail (Mail / Chat / Meet) — visible on `lg` screens only.
 * Mirrors React `<NavRail>` 1:1.
 */
@Component({
  selector: "app-nav-rail",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./nav-rail.component.html",
  styleUrl: "./nav-rail.component.css",
})
export class NavRailComponent {}
